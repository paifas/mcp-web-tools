import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FirecrawlProvider } from "./firecrawl.js";

describe("FirecrawlProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}, once = true) {
    const value = {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
      json: () => Promise.resolve(body),
    };
    if (once) fetchMock.mockResolvedValueOnce(value);
    else fetchMock.mockResolvedValue(value);
  }

  function lastRequest() {
    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return { init: call[1] as RequestInit };
  }

  it("scrapes a single URL and returns mapped result", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(200, {
      success: true,
      data: { markdown: "# Hi", metadata: { sourceURL: "https://example.com/page" } },
    });
    const res = await p.extract({ urls: ["https://example.com/page"] });
    expect(res.results).toEqual([{ url: "https://example.com/page", content: "# Hi" }]);
    expect(res.failedResults).toEqual([]);
  });

  it("omits Authorization header in keyless mode", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(200, { success: true, data: { markdown: "" } });
    await p.extract({ urls: ["https://x.com"] });
    const headers = lastRequest().init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends Bearer auth when API key is set", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev", "sk-test");
    mockResponse(200, { success: true, data: { markdown: "" } });
    await p.extract({ urls: ["https://x.com"] });
    const headers = lastRequest().init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
  });

  it("scrapes multiple URLs", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(200, { success: true, data: { markdown: "a" } });
    mockResponse(200, { success: true, data: { markdown: "b" } });
    const res = await p.extract({ urls: ["https://a.com", "https://b.com"] });
    expect(res.results.map((r) => r.content).sort()).toEqual(["a", "b"]);
  });

  it("retries on 429 honoring Retry-After then succeeds", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(429, {}, { "retry-after": "1" });
    mockResponse(200, { success: true, data: { markdown: "ok" } });
    const promise = p.extract({ urls: ["https://x.com"] });
    // Drive the fake timer forward for the Retry-After wait.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync?.(1000);
    const res = await promise;
    expect(res.results[0].content).toBe("ok");
  });

  it("throws actionable exhaustion message after retries exhausted on 429", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(429, {}, { "retry-after": "1" });
    mockResponse(429, {}, { "retry-after": "1" });
    mockResponse(429, {}, { "retry-after": "1" });
    const promise = p.extract({ urls: ["https://x.com"] });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync?.(1000);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync?.(1000);
    const res = await promise;
    expect(res.failedResults[0].error).toMatch(/keyless free tier/i);
  });

  it("parses non-OK error body", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(402, { error: "payment required" });
    const res = await p.extract({ urls: ["https://x.com"] });
    expect(res.failedResults[0].error).toMatch(/\(402\): payment required/);
  });

  it("handles success=false payload", async () => {
    const p = new FirecrawlProvider("https://api.firecrawl.dev");
    mockResponse(200, { success: false, data: {} });
    const res = await p.extract({ urls: ["https://x.com"] });
    expect(res.failedResults[0].error).toMatch(/scrape unsuccessful/i);
  });

  it("uses custom FIRECRAWL_URL endpoint", async () => {
    const p = new FirecrawlProvider("http://localhost:3002/");
    mockResponse(200, { success: true, data: { markdown: "" } });
    await p.extract({ urls: ["https://x.com"] });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:3002/v1/scrape");
  });
});
