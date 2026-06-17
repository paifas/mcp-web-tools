import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchRepoTool } from "./index.js";

// Minimal ServerConfig shape needed by the tool.
const config = { githubToken: "fake-token" } as unknown as Parameters<typeof registerSearchRepoTool>[1];

// Build a fake McpServer that captures the registered handler.
function captureTool() {
  let captured: {
    schema: Record<string, unknown>;
    handler: (
      params: Record<string, unknown>,
    ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  } | null = null;
  const server = {
    tool: (
      _name: string,
      _desc: string,
      schema: Record<string, unknown>,
      handler: typeof captured extends null ? never : (p: Record<string, unknown>) => Promise<unknown>,
    ) => {
      captured = {
        schema,
        handler: handler as (
          p: Record<string, unknown>,
        ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>,
      };
    },
  } as unknown as McpServer;
  registerSearchRepoTool(server, config);
  if (!captured) throw new Error("tool was not registered");
  return captured;
}

describe("github_search_repo handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  });

  it("passes state qualifier through to issues/PRs searches", async () => {
    const { handler } = captureTool();
    mockGithub("/search/issues", { total_count: 0, items: [] });
    mockGithub("/search/issues", { total_count: 0, items: [] });

    await handler({ repo: "o/r", query: "bug", kind: "all", state: "open" });

    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.every((u) => u.includes(encodeURIComponent("state:open")) || u.includes("/search/code"))).toBe(true);
    const issueCalls = calls.filter((u) => u.includes("/search/issues"));
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
});
