import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SearXNGProvider } from "./searxng.js";

describe("SearXNGProvider", () => {
  let provider: SearXNGProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new SearXNGProvider("http://localhost:8080");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    const merged: Record<string, string> = {
      // Object body → JSON; string body → HTML. Override per-test via headers arg.
      "content-type": typeof body === "string" ? "text/html" : "application/json",
      ...headers,
    };
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => merged[h.toLowerCase()] ?? null },
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
      json: () => Promise.resolve(body),
    });
  }

  it("builds the /search URL with query, format=json, and category", async () => {
    mockResponse(200, { results: [] });
    await provider.search({ query: "hello", maxResults: 3 });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toBe("http://localhost:8080/search?q=hello&format=json&categories=general");
  });

  it("maps topic=news to categories=news", async () => {
    mockResponse(200, { results: [] });
    await provider.search({ query: "x", topic: "news" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("categories=news");
  });

  it("maps topic=finance to categories=general (SearXNG has no finance)", async () => {
    mockResponse(200, { results: [] });
    await provider.search({ query: "x", topic: "finance" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("categories=general");
  });

  it("passes time_range through", async () => {
    mockResponse(200, { results: [] });
    await provider.search({ query: "x", timeRange: "week" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("time_range=week");
  });

  it("returns mapped results", async () => {
    mockResponse(200, {
      results: [
        { title: "A", url: "https://a.com/1", content: "snip a", score: 1.5 },
        { title: "B", url: "https://b.com/2", content: "snip b" },
      ],
    });
    const res = await provider.search({ query: "x", maxResults: 5 });
    expect(res.results).toEqual([
      { title: "A", url: "https://a.com/1", snippet: "snip a", score: 1.5 },
      { title: "B", url: "https://b.com/2", snippet: "snip b", score: undefined },
    ]);
  });

  it("respects maxResults", async () => {
    mockResponse(200, {
      results: Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, url: `https://x.com/${i}` })),
    });
    const res = await provider.search({ query: "x", maxResults: 3 });
    expect(res.results).toHaveLength(3);
  });

  it("post-filters by includeDomains", async () => {
    mockResponse(200, {
      results: [
        { title: "A", url: "https://a.com/1" },
        { title: "B", url: "https://b.com/2" },
        { title: "C", url: "https://a.com/3" },
      ],
    });
    const res = await provider.search({ query: "x", maxResults: 5, includeDomains: ["a.com"] });
    expect(res.results.map((r) => r.url)).toEqual(["https://a.com/1", "https://a.com/3"]);
  });

  it("post-filters by excludeDomains", async () => {
    mockResponse(200, {
      results: [
        { title: "A", url: "https://a.com/1" },
        { title: "B", url: "https://b.com/2" },
      ],
    });
    const res = await provider.search({ query: "x", maxResults: 5, excludeDomains: ["b.com"] });
    expect(res.results.map((r) => r.url)).toEqual(["https://a.com/1"]);
  });

  it("throws actionable 403 error when JSON is disabled", async () => {
    mockResponse(403, "Forbidden");
    await expect(provider.search({ query: "x" })).rejects.toThrow(/JSON output may be disabled/);
  });

  it("throws actionable error when SearXNG redirects to HTML (JSON not enabled)", async () => {
    // SearXNG returns 200 HTML when format=json is not in search.formats.
    mockResponse(200, "<html>redirected</html>", { "content-type": "text/html" });
    await expect(provider.search({ query: "x" })).rejects.toThrow(/did not return JSON/);
  });

  it("throws actionable 429 error", async () => {
    mockResponse(429, {});
    await expect(provider.search({ query: "x" })).rejects.toThrow(/rate limit/i);
  });

  it("surfaces non-OK status with body", async () => {
    mockResponse(500, "boom");
    await expect(provider.search({ query: "x" })).rejects.toThrow(/SearXNG error \(500\): boom/);
  });

  it("accepts a bare host URL", async () => {
    const p = new SearXNGProvider("http://localhost:8080");
    mockResponse(200, { results: [] });
    await p.search({ query: "x" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^http:\/\/localhost:8080\/search/);
  });

  it("accepts a full-path public instance URL", async () => {
    const p = new SearXNGProvider("https://search.mdosch.de");
    mockResponse(200, { results: [] });
    await p.search({ query: "x" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/search\.mdosch\.de\/search/);
  });
});
