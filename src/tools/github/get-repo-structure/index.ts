import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../../config.js";
import { GithubClient, GithubError, type RepoContentEntry } from "../client.js";

const getRepoStructureSchema = {
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, "Must be in the form 'owner/repo' (e.g. 'vitejs/vite')")
    .describe("GitHub repository in the form 'owner/repo'"),
  path: z.string().optional().describe("Directory path inside the repo. Defaults to the root. Use forward slashes."),
  ref: z
    .string()
    .optional()
    .describe("Git ref (branch name, tag, or commit SHA). Defaults to the repo's default branch."),
};

function formatStructure(owner: string, repo: string, entries: RepoContentEntry[], path: string): string {
  const header = path && path !== "/" ? `## ${owner}/${repo}/${path}` : `## ${owner}/${repo} (root)`;
  if (entries.length === 0) {
    return `${header}\n\n(empty directory)`;
  }

  // Sort: directories first, then files, alphabetically within each group.
  const sorted = [...entries].sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  const lines = sorted.map((e) => {
    const icon = e.type === "dir" ? "📁" : e.type === "symlink" ? "🔗" : e.type === "submodule" ? "📦" : "📄";
    const sizeTxt = e.type === "file" ? ` (${formatBytes(e.size)})` : "";
    return `${icon} ${e.name}${sizeTxt}`;
  });

  return [header, "", ...lines].join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerGetRepoStructureTool(server: McpServer, config: ServerConfig) {
  const client = new GithubClient(config.githubToken);

  server.tool(
    "github_get_repo_structure",
    "List the directory structure of a GitHub repository path (single level, non-recursive). " +
      "Useful for understanding project layout and discovering files. Works without a token " +
      "(anonymous rate limits apply — set GITHUB_TOKEN for higher limits).",
    getRepoStructureSchema,
    async (params) => {
      try {
        const [owner, repo] = params.repo.split("/");
        const path = params.path ?? "/";
        const result = await client.listContents(owner, repo, path, params.ref);

        if (!Array.isArray(result)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Path "${path}" in ${params.repo} is a file, not a directory. Use github_read_file to read its contents.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: formatStructure(owner, repo, result, path) }],
        };
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
