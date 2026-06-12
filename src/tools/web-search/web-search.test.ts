import { describe, it, expect } from "vitest";
import { cacheKey, cacheGet, cacheSet } from "../../utils/cache/index.js";
import type { SearchResponse } from "../../types.js";

describe("web-search caching", () => {
  it("caches and retrieves search results", () => {
    const params = { query: "test", depth: "basic" };
    const key = cacheKey("search", params);
    const data: SearchResponse = {
      query: "test",
      results: [{ title: "Test", url: "https://x.com", snippet: "hi", score: 1 }],
      responseTime: 100,
    };
    cacheSet(key, data, 60);
    expect(cacheGet<SearchResponse>(key)).toEqual(data);
  });

  it("different queries produce different cache keys", () => {
    const key1 = cacheKey("search", { query: "alpha" });
    const key2 = cacheKey("search", { query: "beta" });
    expect(key1).not.toBe(key2);
  });
});
