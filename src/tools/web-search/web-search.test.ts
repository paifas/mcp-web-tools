import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebSearchTool } from "./index.js";
import { cacheReset } from "../../utils/cache/index.js";
import { TavilyError } from "../../providers/tavily/tavily-search.js";
import { openMcp, testConfig, toolText } from "../../../test/helpers.js";

describe("web_search through MCP", () => {
  const search = vi.fn();
  let connection: Awaited<ReturnType<typeof openMcp>>;
  beforeEach(async () => {
    cacheReset();
    search.mockReset().mockResolvedValue({
      query: "fixture",
      results: [{ title: "Source", url: "https://example.com", snippet: "Evidence" }],
    });
    connection = await openMcp((server) =>
      registerWebSearchTool(server, testConfig({ defaultMaxResults: 7 }), { name: "searxng", search }),
    );
  });
  afterEach(async () => {
    await connection.close();
    cacheReset();
  });
  it("normalizes whitespace, passes configured defaults and caches successful results", async () => {
    const first = await connection.call("web_search", { query: "  fixture  " });
    expect(first.isError).not.toBe(true);
    expect(toolText(first)).toContain("Evidence");
    await connection.call("web_search", { query: "fixture" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "fixture", maxResults: 7, searchDepth: "basic" }),
    );
  });
  it.each([
    { query: "" },
    { query: "   " },
    { query: "x", maxResults: 1.5 },
    { query: "x", maxResults: 21 },
    { query: "x", startDate: "2025-02-29" },
    { query: "x", endDate: "2026-13-01" },
    { query: "x", startDate: "2026-02-02", endDate: "2026-02-01" },
  ])("rejects malformed arguments %j", async (args) => {
    expect((await connection.call("web_search", args)).isError).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });
  it("accepts a real leap day and equal date boundaries", async () => {
    expect(
      (await connection.call("web_search", { query: "x", startDate: "2024-02-29", endDate: "2024-02-29" })).isError,
    ).not.toBe(true);
  });
  it.each([new Error("offline"), new TavilyError("quota exhausted", 432)])(
    "does not cache provider errors",
    async (error) => {
      search.mockRejectedValueOnce(error);
      expect((await connection.call("web_search", { query: "x" })).isError).toBe(true);
      expect((await connection.call("web_search", { query: "x" })).isError).not.toBe(true);
      expect(search).toHaveBeenCalledTimes(2);
    },
  );
  it("lists provider limitations and the actual configured default", async () => {
    const tool = (await connection.client.listTools()).tools[0];
    expect(tool.description).toContain("searxng");
    expect(tool.description).toContain("ignored");
    expect(JSON.stringify(tool.inputSchema)).toContain("default: 7");
  });
});
