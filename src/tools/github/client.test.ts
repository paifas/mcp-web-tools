import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GithubClient, GithubRateLimitError, GithubNotFoundError, GithubError } from "./client.js";

describe("GithubClient", () => {
  let client: GithubClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new GithubClient("fake-token");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
      json: () => Promise.resolve(body),
    });
  }

  describe("listContents", () => {
    it("returns an array of entries for a directory", async () => {
      const body = [
        { name: "src", path: "src", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 1234 },
      ];
      mockResponse(200, body);

      const result = await client.listContents("vitejs", "vite", "/");
      expect(Array.isArray(result)).toBe(true);
      expect((result as { name: string }[])[0].name).toBe("src");
    });

    it("returns a single object when the path is a file", async () => {
      const body = {
        name: "README.md",
        path: "README.md",
        type: "file",
        size: 100,
        content: "aGVsbG8=",
        encoding: "base64",
      };
      mockResponse(200, body);

      const result = await client.listContents("vitejs", "vite", "README.md");
      expect(Array.isArray(result)).toBe(false);
      expect((result as { name: string }).name).toBe("README.md");
    });

    it("sends Authorization header when token is present", async () => {
      mockResponse(200, []);
      await client.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    });

    it("includes User-Agent header (required by GitHub)", async () => {
      mockResponse(200, []);
      await client.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)["User-Agent"]).toBe("mcp-web-tools");
    });

    it("throws GithubNotFoundError on 404", async () => {
      mockResponse(404, { message: "Not Found" });
      await expect(client.listContents("foo", "bar", "/")).rejects.toBeInstanceOf(GithubNotFoundError);
    });

    it("throws GithubRateLimitError on 403 with x-ratelimit-remaining: 0", async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      mockResponse(
        403,
        { message: "rate limit exceeded" },
        {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetEpoch),
        },
      );

      const err = await client.listContents("foo", "bar", "/").catch((e) => e);
      expect(err).toBeInstanceOf(GithubRateLimitError);
      expect((err as GithubRateLimitError).message).toContain("GITHUB_TOKEN");
      expect((err as GithubRateLimitError).message).toContain("5000 requests/hour");
    });

    it("treats 403 without rate-limit header as a generic error", async () => {
      mockResponse(403, { message: "forbidden for other reasons" });
      await expect(client.listContents("foo", "bar", "/")).rejects.toBeInstanceOf(GithubError);
    });
  });

  describe("readFile", () => {
    it("returns file content object when path is a file", async () => {
      const body = { name: "file.ts", path: "file.ts", type: "file", size: 5, content: "aGVsbG8=", encoding: "base64" };
      mockResponse(200, body);

      const result = await client.readFile("vitejs", "vite", "file.ts");
      expect(result.name).toBe("file.ts");
      expect(result.content).toBe("aGVsbG8=");
    });

    it("throws when the path resolves to a directory", async () => {
      mockResponse(200, [{ name: "a", path: "a", type: "file", size: 0 }]);
      const err = await client.readFile("vitejs", "vite", "src").catch((e) => e);
      expect(err).toBeInstanceOf(GithubError);
      expect((err as GithubError).message).toContain("directory");
    });
  });

  describe("anonymous client (no token)", () => {
    it("does not send Authorization header", async () => {
      const anonClient = new GithubClient();
      mockResponse(200, []);
      await anonClient.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
  });

  describe("searchCode", () => {
    it("returns code results with path, url, and optional snippet", async () => {
      mockResponse(200, {
        total_count: 1,
        items: [
          {
            name: "auth.ts",
            path: "src/auth.ts",
            html_url: "https://github.com/o/r/blob/HEAD/src/auth.ts",
            text_matches: [{ fragment: "export function <mark>auth</mark>token() {" }],
          },
        ],
      });
      const result = await client.searchCode("o", "r", "auth token", { maxResults: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/auth.ts");
      expect(result[0].url).toContain("src/auth.ts");
      expect(result[0].snippet).toContain("export function authtoken");
    });

    it("scopes the query with repo:owner/repo and per_page", async () => {
      mockResponse(200, { total_count: 0, items: [] });
      await client.searchCode("o", "r", "foo", { maxResults: 7 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/search/code");
      expect(url).toContain("per_page=7");
      expect(url).toContain(encodeURIComponent("foo repo:o/r"));
    });

    it("returns empty array when items is missing", async () => {
      mockResponse(200, { total_count: 0 });
      const result = await client.searchCode("o", "r", "foo");
      expect(result).toEqual([]);
    });

    it("propagates rate-limit errors", async () => {
      mockResponse(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0" });
      await expect(client.searchCode("o", "r", "foo")).rejects.toBeInstanceOf(GithubRateLimitError);
    });

    it("propagates 422 validation errors as GithubError", async () => {
      mockResponse(422, { message: "Validation Failed" });
      const err = await client.searchCode("o", "r", "foo").catch((e) => e);
      expect(err).toBeInstanceOf(GithubError);
      expect((err as GithubError).status).toBe(422);
    });
  });

  describe("searchIssues", () => {
    it("returns issues (non-PR) with type:issue qualifier", async () => {
      mockResponse(200, {
        total_count: 1,
        items: [
          {
            number: 42,
            title: "Bug in login",
            html_url: "https://github.com/o/r/issues/42",
            state: "open",
            updated_at: "2024-08-12T00:00:00Z",
            body: "Login fails when password has spaces.",
          },
        ],
      });
      const result = await client.searchIssues("o", "r", "login", { maxResults: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(42);
      expect(result[0].isPullRequest).toBe(false);
      expect(result[0].snippet).toContain("Login fails");
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent("login repo:o/r type:issue"));
    });

    it("omits the state qualifier when state is 'all'", async () => {
      mockResponse(200, { total_count: 0, items: [] });
      await client.searchIssues("o", "r", "foo", { state: "all" });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain("state:");
    });

    it("includes state:open when state is 'open'", async () => {
      mockResponse(200, { total_count: 0, items: [] });
      await client.searchIssues("o", "r", "foo", { state: "open" });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent("state:open"));
    });
  });

  describe("searchPullRequests", () => {
    it("uses type:pr qualifier and flags isPullRequest", async () => {
      mockResponse(200, {
        total_count: 1,
        items: [
          {
            number: 7,
            title: "Fix login",
            html_url: "https://github.com/o/r/pull/7",
            state: "closed",
            updated_at: "2024-09-01T00:00:00Z",
            pull_request: { url: "x" },
            body: null,
          },
        ],
      });
      const result = await client.searchPullRequests("o", "r", "fix", { maxResults: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].isPullRequest).toBe(true);
      expect(result[0].snippet).toBeUndefined();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent("fix repo:o/r type:pr"));
    });
  });
});
