/**
 * Low-level HTTP client for the GitHub REST API.
 *
 * - Optional Bearer auth via GITHUB_TOKEN (lifts rate limit from 60 to 5000 req/hr).
 * - Detects rate-limit responses (403 with `x-ratelimit-remaining: 0`) and throws
 *   a typed error with a message telling the user to set GITHUB_TOKEN. The tool
 *   layer surfaces this verbatim.
 * - 404 → GithubNotFoundError (repo/path/ref not found).
 * - Other non-2xx → GithubError with status + body.
 */

const BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 30_000;

export class GithubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export class GithubRateLimitError extends GithubError {
  constructor(resetAt: Date | undefined) {
    const resetTxt = resetAt ? ` resets at ${resetAt.toISOString()}` : "";
    super(
      `GitHub API rate limit exceeded (anonymous quota exhausted).${resetTxt} ` +
        "Set the GITHUB_TOKEN environment variable to lift the limit to 5000 requests/hour. " +
        "Create a token at https://github.com/settings/tokens (no scopes required for public repos).",
      403,
    );
    this.name = "GithubRateLimitError";
  }
}

export class GithubNotFoundError extends GithubError {
  constructor(resource: string) {
    super(`GitHub resource not found: ${resource}`, 404);
    this.name = "GithubNotFoundError";
  }
}

export interface RepoContentEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
}

export interface RepoFileContent {
  name: string;
  path: string;
  content: string;
  encoding: "base64" | "none";
  size: number;
}

export interface CodeSearchResult {
  path: string;
  url: string; // html_url
  snippet?: string; // text_matches fragment if present, else undefined
}

export interface IssueSearchResult {
  number: number;
  title: string;
  url: string; // html_url
  state: "open" | "closed";
  isPullRequest: boolean;
  updatedAt: string; // ISO
  snippet?: string; // first ~200 chars of body
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Label included in the not-found message for clearer errors. */
  resourceDescription?: string;
}

export class GithubClient {
  constructor(private readonly token?: string) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "mcp-web-tools",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const remaining = response.headers.get("x-ratelimit-remaining");

        if (response.status === 403 && remaining === "0") {
          const resetEpoch = response.headers.get("x-ratelimit-reset");
          const resetAt = resetEpoch ? new Date(Number(resetEpoch) * 1000) : undefined;
          throw new GithubRateLimitError(resetAt);
        }
        if (response.status === 404) {
          throw new GithubNotFoundError(opts.resourceDescription ?? path);
        }
        throw new GithubError(`GitHub API error (${response.status}): ${text || response.statusText}`, response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof GithubError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GithubError("GitHub API request timed out", 408);
      }
      throw new GithubError(
        `GitHub API request failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * List contents of a path inside a repo (single level, non-recursive).
   * Returns `RepoFileContent` if the path points at a file (caller should handle
   * the union type — the tool layer differentiates by `Array.isArray`).
   */
  async listContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<RepoContentEntry[] | RepoFileContent> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const trimmedPath = path.replace(/^\/+/, "");
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${trimmedPath}${query}`;
    return this.request<RepoContentEntry[] | RepoFileContent>(url, {
      resourceDescription: `${owner}/${repo}/${trimmedPath}${ref ? `@${ref}` : ""}`,
    });
  }

  /**
   * Fetch a single file's content. Throws GithubNotFoundError if the path is a
   * directory or doesn't exist.
   */
  async readFile(owner: string, repo: string, path: string, ref?: string): Promise<RepoFileContent> {
    const result = await this.listContents(owner, repo, path, ref);
    if (Array.isArray(result)) {
      throw new GithubError(
        `Path ${owner}/${repo}/${path} is a directory, not a file. Use get_repo_structure to list directory contents.`,
        400,
      );
    }
    return result;
  }

  /**
   * Search for code matches inside a repo. Uses GitHub's /search/code endpoint
   * scoped with `repo:owner/repo`. Note: code search requires the repo to be
   * indexed by GitHub; small/new repos may return nothing.
   */
  async searchCode(
    owner: string,
    repo: string,
    query: string,
    opts: { maxResults?: number } = {},
  ): Promise<CodeSearchResult[]> {
    const perPage = clampPerPage(opts.maxResults);
    const q = `${query} repo:${owner}/${repo}`;
    const url = `/search/code?per_page=${perPage}&q=${encodeURIComponent(q)}`;
    const payload = await this.request<RawCodeSearchPayload>(url, {
      resourceDescription: `code search in ${owner}/${repo}`,
    });
    return (payload.items ?? []).slice(0, perPage).map((it) => ({
      path: it.path,
      url: it.html_url,
      snippet: extractCodeSnippet(it),
    }));
  }

  /**
   * Search issues (non-PR) inside a repo via /search/issues with `type:issue`.
   */
  async searchIssues(
    owner: string,
    repo: string,
    query: string,
    opts: { maxResults?: number; state?: "open" | "closed" | "all" } = {},
  ): Promise<IssueSearchResult[]> {
    return this.searchIssuesOrPRs(owner, repo, query, "issue", opts);
  }

  /**
   * Search pull requests inside a repo via /search/issues with `type:pr`.
   */
  async searchPullRequests(
    owner: string,
    repo: string,
    query: string,
    opts: { maxResults?: number; state?: "open" | "closed" | "all" } = {},
  ): Promise<IssueSearchResult[]> {
    return this.searchIssuesOrPRs(owner, repo, query, "pr", opts);
  }

  private async searchIssuesOrPRs(
    owner: string,
    repo: string,
    query: string,
    type: "issue" | "pr",
    opts: { maxResults?: number; state?: "open" | "closed" | "all" },
  ): Promise<IssueSearchResult[]> {
    const perPage = clampPerPage(opts.maxResults);
    const stateQualifier = opts.state && opts.state !== "all" ? ` state:${opts.state}` : "";
    const q = `${query} repo:${owner}/${repo} type:${type}${stateQualifier}`;
    const url = `/search/issues?per_page=${perPage}&q=${encodeURIComponent(q)}`;
    const payload = await this.request<RawIssueSearchPayload>(url, {
      resourceDescription: `${type} search in ${owner}/${repo}`,
    });
    return (payload.items ?? []).slice(0, perPage).map((it) => ({
      number: it.number,
      title: it.title,
      url: it.html_url,
      state: it.state,
      isPullRequest: Boolean(it.pull_request),
      updatedAt: it.updated_at,
      snippet: truncate(it.body),
    }));
  }
}

interface RawCodeSearchItem {
  path: string;
  html_url: string;
  text_matches?: Array<{ fragment?: string }>;
}

interface RawCodeSearchPayload {
  total_count?: number;
  items?: RawCodeSearchItem[];
}

interface RawIssueSearchItem {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  pull_request?: unknown;
  updated_at: string;
  body?: string | null;
}

interface RawIssueSearchPayload {
  total_count?: number;
  items?: RawIssueSearchItem[];
}

function clampPerPage(maxResults?: number): number {
  if (typeof maxResults !== "number" || !Number.isFinite(maxResults)) return 5;
  return Math.max(1, Math.min(100, Math.floor(maxResults)));
}

function truncate(text: string | null | undefined, max = 200): string | undefined {
  if (!text) return undefined;
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

function extractCodeSnippet(item: RawCodeSearchItem): string | undefined {
  const fragment = item.text_matches?.[0]?.fragment;
  if (fragment) return truncate(fragment.replace(/<[^>]+>/g, ""), 200);
  return undefined;
}
