import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebReaderTool } from "./index.js";
import { cacheReset } from "../../utils/cache/index.js";
import type { ExtractResponse } from "../../types.js";
import { openMcp, testConfig, toolText } from "../../../test/helpers.js";

describe("web_read through MCP", () => {
  const extract = vi.fn<() => Promise<ExtractResponse>>();
  let connection: Awaited<ReturnType<typeof openMcp>>;
  const args = { urls: ["https://example.com/page"] };
  const success: ExtractResponse = {
    results: [{ url: args.urls[0], content: "# Page", images: ["https://example.com/image.png"] }],
    failedResults: [],
  };

  beforeEach(async () => {
    cacheReset();
    extract.mockReset().mockResolvedValue(success);
    connection = await openMcp((server) => registerWebReaderTool(server, testConfig(), { name: "tavily", extract }));
  });
  afterEach(async () => {
    await connection.close();
    cacheReset();
  });

  it("returns content and images on fresh and cached responses", async () => {
    for (let i = 0; i < 2; i++) {
      const result = await connection.call("web_read", { ...args, includeImages: true });
      expect(result.isError).not.toBe(true);
      expect(toolText(result)).toContain("# Page");
      expect(toolText(result)).toContain("https://example.com/image.png");
    }
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("does not cache a total failure and can recover", async () => {
    extract.mockResolvedValueOnce({ results: [], failedResults: [{ url: args.urls[0], error: "temporary outage" }] });
    const failed = await connection.call("web_read", args);
    expect(failed.isError).toBe(true);
    expect(toolText(failed)).toContain("temporary outage");
    expect((await connection.call("web_read", args)).isError).toBe(false);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("preserves partial content without caching failures", async () => {
    extract.mockResolvedValue({ ...success, failedResults: [{ url: "https://example.com/failed", error: "outage" }] });
    const params = { urls: [...args.urls, "https://example.com/failed"] };
    const result = await connection.call("web_read", params);
    expect(result.isError).toBe(false);
    expect(toolText(result)).toContain("Partial extraction");
    expect(toolText(result)).toContain("# Page");
    expect(toolText(result)).toContain("outage");
    await connection.call("web_read", params);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("does not cache incomplete responses without failure details", async () => {
    const params = { urls: [...args.urls, "https://example.com/missing"] };
    await connection.call("web_read", params);
    await connection.call("web_read", params);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("reports an empty result envelope as an error", async () => {
    extract.mockResolvedValue({ results: [], failedResults: [] });
    const result = await connection.call("web_read", args);
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain("No readable content");
  });

  it("converts provider exceptions to MCP errors without caching", async () => {
    extract.mockRejectedValueOnce(new Error("offline"));
    expect((await connection.call("web_read", args)).isError).toBe(true);
    expect((await connection.call("web_read", args)).isError).toBe(false);
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "https://",
    "https://user:secret@example.com",
    "http://user@example.com",
  ])("rejects unsafe/invalid syntax %s before calling provider", async (url) => {
    expect((await connection.call("web_read", { urls: [url] })).isError).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });
  it.each([[], Array(21).fill("https://example.com")])("enforces URL count", async (urls) => {
    expect((await connection.call("web_read", { urls })).isError).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });
  it("allows local HTTP target syntax without claiming SSRF protection", async () => {
    expect((await connection.call("web_read", { urls: ["http://localhost:8080"] })).isError).not.toBe(true);
    expect(extract).toHaveBeenCalled();
  });

  describe("relevance query", () => {
    it("passes query to the provider and includes it in the cache key", async () => {
      const params = { ...args, query: "  free monthly allowance  " };
      await connection.call("web_read", params);
      expect(extract).toHaveBeenLastCalledWith(expect.objectContaining({ query: "free monthly allowance" }));

      // Same URLs without a query must not hit the query's cache entry.
      await connection.call("web_read", args);
      expect(extract).toHaveBeenCalledTimes(2);
      expect(extract).toHaveBeenLastCalledWith(expect.objectContaining({ query: undefined }));

      // The original query call is cached.
      await connection.call("web_read", params);
      expect(extract).toHaveBeenCalledTimes(2);
    });

    it.each([{ query: "" }, { query: "   " }])("rejects blank query %j before calling the provider", async (extra) => {
      expect((await connection.call("web_read", { ...args, ...extra })).isError).toBe(true);
      expect(extract).not.toHaveBeenCalled();
    });

    it("describes query as Tavily-only when Tavily is active", async () => {
      const tool = (await connection.client.listTools()).tools[0];
      expect(JSON.stringify(tool.inputSchema)).toContain("relevant passages");
    });
  });

  describe("character limit", () => {
    // The shared test config sets maxChars: 0 so older assertions see full output.
    // These tests opt into a real limit explicitly.
    async function withLimit(maxChars: number) {
      await connection.close();
      connection = await openMcp((server) =>
        registerWebReaderTool(server, testConfig({ maxChars }), { name: "tavily", extract }),
      );
    }

    it("truncates a long page and says so", async () => {
      await withLimit(20_000);
      extract.mockResolvedValue({ ...success, results: [{ url: args.urls[0], content: "P".repeat(30_000) }] });
      const text = toolText(await connection.call("web_read", args));
      expect(text).toContain("[truncated: showing 20000 of 30000 characters]");
    });

    it("does not truncate when the limit is 0", async () => {
      await withLimit(0);
      extract.mockResolvedValue({ ...success, results: [{ url: args.urls[0], content: "F".repeat(30_000) }] });
      const text = toolText(await connection.call("web_read", args));
      expect(text).toContain("F".repeat(30_000));
      expect(text).not.toContain("truncated");
    });

    it("keeps the full response in cache and applies the limit on output", async () => {
      const content = "C".repeat(25_000);
      extract.mockResolvedValue({ ...success, results: [{ url: args.urls[0], content }] });
      await withLimit(20_000);
      await connection.call("web_read", args); // caches full content, truncates at 20k

      await withLimit(5_000);
      const text = toolText(await connection.call("web_read", args));
      expect(extract).toHaveBeenCalledTimes(1); // served from cache: no second provider call
      expect(text).toContain("[truncated: showing 5000 of 25000 characters]");
    });
  });
});
