import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerSearchRepoTool } from "./index.js";

// Minimal ServerConfig shape needed by the tool.
const config = { githubToken: "fake-token" } as unknown as Parameters<typeof registerSearchRepoTool>[1];

// Build a fake McpServer that captures the registered handler.
function captureTool() {
  const tool = vi.fn();
  registerSearchRepoTool({ tool } as unknown as McpServer, config);
  const [name, description, schema, handler] = tool.mock.calls[0] as [
    string,
    string,
    z.ZodRawShape,
    (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>,
  ];
  return { name, description, schema, handler };
}

describe("github_search_repo handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockGithub(urlFragment: string, body: unknown, status = 200) {
    fetchMock.mockImplementationOnce(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (!u.includes(urlFragment)) {
        throw new Error(`unexpected fetch: ${u} (expected to contain ${urlFragment})`);
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      };
    });
  }

  it("renders all three sections when kind=all (default)", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", {
      total_count: 1,
      items: [{ path: "src/auth.ts", html_url: "https://github.com/o/r/blob/HEAD/src/auth.ts" }],
    });
    mockGithub("/search/issues", {
      total_count: 1,
      items: [
        {
          number: 11,
          title: "Auth bug",
          html_url: "https://github.com/o/r/issues/11",
          state: "open",
          updated_at: "2024-08-12T00:00:00Z",
          body: "fails",
        },
      ],
    });
    // PR search — we set up two issue-search mocks; second one will match PR request.
    mockGithub("/search/issues", {
      total_count: 1,
      items: [
        {
          number: 22,
          title: "Fix auth",
          html_url: "https://github.com/o/r/pull/22",
          state: "closed",
          updated_at: "2024-09-01T00:00:00Z",
          pull_request: {},
          body: null,
        },
      ],
    });

    const out = await handler({ repo: "o/r", query: "auth" });
    const text = out.content[0].text;
    expect(text).toContain("### 📁 Code (1)");
    expect(text).toContain("src/auth.ts");
    expect(text).toContain("### 🐞 Issues (1)");
    expect(text).toContain("#11 Auth bug");
    expect(text).toContain("### 🔀 Pull requests (1)");
    expect(text).toContain("#22 Fix auth");
    expect(text).toContain("3 results • Searched code, issues, prs");
    expect(out.isError).toBeUndefined();
  });

  it("renders only the requested kind", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "foo", kind: "code" });
    const text = out.content[0].text;
    expect(text).toContain("### 📁 Code");
    expect(text).not.toContain("### 🐞 Issues");
    expect(text).not.toContain("### 🔀 Pull requests");
    expect(text).toContain("Searched code");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders 'no results' for empty sections", async () => {
    const { handler } = captureTool();
    mockGithub("/search/issues", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "nothing", kind: "issues" });
    expect(out.content[0].text).toContain("(no results)");
    expect(out.isError).toBeUndefined();
  });

  it("passes state qualifier through to issues/PRs searches", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "bug", kind: "all", state: "open", maxResults: 3 });

    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls).toHaveLength(3);
    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).not.toContain("_Error:");
    expect(calls.every((u) => u.includes("per_page=3"))).toBe(true);
    expect(calls.every((u) => u.includes(encodeURIComponent("state:open")) || u.includes("/search/code"))).toBe(true);
    const issueCalls = calls.filter((u) => u.includes("/search/issues"));
    expect(issueCalls).toHaveLength(2);
    expect(issueCalls.every((u) => u.includes(encodeURIComponent("state:open")))).toBe(true);
  });

  it("surfaces GithubRateLimitError verbatim as an error response", async () => {
    const { handler } = captureTool();
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ "x-ratelimit-remaining": "0" }),
      text: () => Promise.resolve(JSON.stringify({ message: "rate limit" })),
      json: () => Promise.resolve({ message: "rate limit" }),
    }));

    const out = await handler({ repo: "o/r", query: "x", kind: "code" });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("GITHUB_TOKEN");
  });

  it("includes per-section errors when one endpoint fails non-fatally", async () => {
    const { handler } = captureTool();
    // Code endpoint fails with 422; issues succeed.
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 422,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ message: "Validation Failed" })),
      json: () => Promise.resolve({ message: "Validation Failed" }),
    }));
    mockGithub("/search/issues", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "x" });
    const text = out.content[0].text;
    expect(out.isError).toBeUndefined();
    expect(text).toContain("### 📁 Code");
    expect(text).toContain("Validation Failed");
  });

  it.each([
    { kind: "code", endpoint: "/search/code", status: 401 },
    { kind: "issues", endpoint: "/search/issues", status: 404 },
    { kind: "prs", endpoint: "/search/issues", status: 500 },
  ])("errors when only $kind is requested and fails", async ({ kind, endpoint, status }) => {
    const { handler } = captureTool();
    mockGithub(endpoint, { message: "Search unavailable" }, status);

    const out = await handler({ repo: "o/r", query: "x", kind });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("_Error:");
    expect(out.content[0].text).not.toContain("(no results)");
    expect(out.content[0].text).toContain(`Searched ${kind}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks all requested sections failing as an error and preserves their details", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { message: "Requires authentication" }, 401);
    mockGithub("/search/issues", { message: "Issues unavailable" }, 500);
    mockGithub("/search/issues", { message: "Pull requests unavailable" }, 502);

    const out = await handler({ repo: "o/r", query: "x" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("Requires authentication");
    expect(out.content[0].text).toContain("Issues unavailable");
    expect(out.content[0].text).toContain("Pull requests unavailable");
    expect(out.content[0].text).not.toContain("(no results)");
  });

  it("preserves successful results alongside failed sections", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { message: "Requires authentication" }, 401);
    mockGithub("/search/issues", {
      total_count: 1,
      items: [
        {
          number: 3,
          title: "Retained issue",
          html_url: "https://github.com/o/r/issues/3",
          state: "open",
          updated_at: "2026-11-01T00:00:00Z",
          body: "Useful result",
        },
      ],
    });
    mockGithub("/search/issues", { message: "Pull requests unavailable" }, 500);

    const out = await handler({ repo: "o/r", query: "x" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("#3 Retained issue");
    expect(out.content[0].text).toContain("Requires authentication");
    expect(out.content[0].text).toContain("Pull requests unavailable");
    expect(out.content[0].text).toContain("1 result • Searched code, issues, prs");
  });

  it("counts a successful empty section as success even when the other sections fail", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { message: "Requires authentication" }, 401);
    mockGithub("/search/issues", { total_count: 0, items: [] });
    mockGithub("/search/issues", { message: "Unavailable" }, 500);

    const out = await handler({ repo: "o/r", query: "nothing" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("### 🐞 Issues\n\n(no results)");
  });

  it("keeps a successful all-section zero-result search successful", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "nothing" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text.match(/\(no results\)/g)).toHaveLength(3);
    expect(out.content[0].text).toContain("0 results • Searched code, issues, prs");
  });

  it("retains rate-limit hard-stop behavior even when another section succeeds", async () => {
    const { handler } = captureTool();
    mockGithub("/search/code", { total_count: 0, items: [] });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "rate limit" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1795219200" },
      }),
    );
    mockGithub("/search/issues", { total_count: 0, items: [] });

    const out = await handler({ repo: "o/r", query: "x" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("GitHub API rate limit exceeded");
    expect(out.content[0].text).toContain("resets at");
    expect(out.content[0].text).toContain("GITHUB_TOKEN");
  });

  it("documents code-search authentication and retains the published parameters", () => {
    const { name, description, schema } = captureTool();
    expect(name).toBe("github_search_repo");
    expect(description).toContain("Code search uses /search/code and requires GITHUB_TOKEN");
    expect(description).toContain("Public-repository issues and PRs");
    expect(Object.keys(schema)).toEqual(["repo", "query", "kind", "state", "maxResults"]);
    expect(z.object(schema).parse({ repo: "o/r", query: "  auth  " }).query).toBe("auth");
    expect(z.object(schema).safeParse({ repo: "o/r", query: "   " }).success).toBe(false);
  });
});
