import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../../config.js";
import {
  GithubClient,
  GithubError,
  GithubRateLimitError,
  type CodeSearchResult,
  type IssueSearchResult,
} from "../client.js";

const searchRepoSchema = {
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, "Must be in the form 'owner/repo' (e.g. 'vitejs/vite')")
    .describe("GitHub repository in the form 'owner/repo'"),
  query: z
    .string()
    .min(1)
    .describe(
      "Search query. GitHub search syntax is supported (e.g. 'auth token', 'bug in login', 'TODO refactor', 'label:bug').",
    ),
  kind: z
    .enum(["code", "issues", "prs", "all"])
    .optional()
    .describe("What to search. 'all' fans out across code, issues, and PRs in parallel. Default 'all'."),
  state: z
    .enum(["open", "closed", "all"])
    .optional()
    .describe("Filter for issues/PRs only. Ignored for code. Default 'all'."),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Max results per kind. Default 5 (so 'all' returns up to 15 total)."),
};

interface Section {
  label: string;
  emoji: string;
  total: number;
  error?: string;
}

function formatCodeItem(item: CodeSearchResult): string {
  const snippet = item.snippet ? ` — ${item.snippet}` : "";
  return `- [\`${item.path}\`](${item.url})${snippet}`;
}

function formatIssueItem(item: IssueSearchResult): string {
  const updated = item.updatedAt.slice(0, 10);
  const snippet = item.snippet ? ` — ${item.snippet}` : "";
  return `- [#${item.number} ${item.title}](${item.url}) — ${item.state}, updated ${updated}${snippet}`;
}

function formatSection(section: Section, lines: string[]): string {
  const header = `### ${section.emoji} ${section.label}${section.total > 0 ? ` (${section.total})` : ""}`;
  if (section.error) return `${header}\n\n_Error: ${section.error}_`;
  if (lines.length === 0) return `${header}\n\n(no results)`;
  return `${header}\n${lines.join("\n")}`;
}

function describeError(reason: unknown): string | undefined {
  if (reason instanceof GithubRateLimitError) return undefined; // surfaced elsewhere
  if (reason instanceof GithubError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

type Settled<T> = PromiseSettledResult<T[]>;

function unwrap<T>(r: Settled<T>): { items: T[]; error?: string } {
  if (r.status === "fulfilled") return { items: r.value };
  return { items: [], error: describeError(r.reason) };
}

export function registerSearchRepoTool(server: McpServer, config: ServerConfig) {
  const client = new GithubClient(config.githubToken);

  server.tool(
    "github_search_repo",
    "Search a GitHub repository across code, issues, and pull requests in one call. " +
      "Code search uses /search/code (requires the repo to be indexed by GitHub). " +
      "Issues and PRs use /search/issues. Works without a token (anonymous rate limits apply — " +
      "set GITHUB_TOKEN for higher limits).",
    searchRepoSchema,
    async (params) => {
      try {
        const [owner, repo] = params.repo.split("/");
        const kind = params.kind ?? "all";
        const state = params.state ?? "all";
        const maxResults = params.maxResults ?? 5;

        const wantCode = kind === "code" || kind === "all";
        const wantIssues = kind === "issues" || kind === "all";
        const wantPRs = kind === "prs" || kind === "all";

        const [codeR, issuesR, prsR] = (await Promise.allSettled([
          wantCode ? client.searchCode(owner, repo, params.query, { maxResults }) : Promise.resolve([]),
          wantIssues ? client.searchIssues(owner, repo, params.query, { maxResults, state }) : Promise.resolve([]),
          wantPRs ? client.searchPullRequests(owner, repo, params.query, { maxResults, state }) : Promise.resolve([]),
        ])) as [Settled<CodeSearchResult>, Settled<IssueSearchResult>, Settled<IssueSearchResult>];

        // Rate-limit errors are a hard stop the user needs to see verbatim.
        for (const r of [codeR, issuesR, prsR]) {
          if (r.status === "rejected" && r.reason instanceof GithubRateLimitError) throw r.reason;
        }

        const sections: string[] = [];
        let totalShown = 0;

        if (wantCode) {
          const { items, error } = unwrap(codeR);
          sections.push(
            formatSection({ label: "Code", emoji: "📁", total: items.length, error }, items.map(formatCodeItem)),
          );
          totalShown += items.length;
        }

        if (wantIssues) {
          const { items, error } = unwrap(issuesR);
          sections.push(
            formatSection({ label: "Issues", emoji: "🐞", total: items.length, error }, items.map(formatIssueItem)),
          );
          totalShown += items.length;
        }

        if (wantPRs) {
          const { items, error } = unwrap(prsR);
          sections.push(
            formatSection(
              { label: "Pull requests", emoji: "🔀", total: items.length, error },
              items.map(formatIssueItem),
            ),
          );
          totalShown += items.length;
        }

        const header = `## 🔍 Search results for "${params.query}" in ${params.repo}`;
        const queried = [wantCode && "code", wantIssues && "issues", wantPRs && "prs"].filter(Boolean).join(", ");
        const footer = `_${totalShown} result${totalShown === 1 ? "" : "s"} • Searched ${queried}_`;
        const text = [header, "", ...sections, "", footer].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof GithubError ? error.message : `Unexpected error: ${String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
