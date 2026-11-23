import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FirecrawlProvider } from "./firecrawl.js";

const URL = "https://example.com/page";
const NOW = Date.UTC(2026, 10, 20, 12);

describe("FirecrawlProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let provider: FirecrawlProvider;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Native AbortSignal.timeout uses real timers independently of Vitest's clock.
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    provider = new FirecrawlProvider("https://api.firecrawl.dev");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function response(status: number, body: unknown, retryAfter?: string | null): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: retryAfter == null ? {} : { "Retry-After": retryAfter },
    });
  }

  function mockResponse(status: number, body: unknown, retryAfter?: string | null) {
    fetchMock.mockResolvedValueOnce(response(status, body, retryAfter));
  }

  function mockSuccess(markdown = "ok") {
    mockResponse(200, { success: true, data: { markdown } });
  }

  it("uses hosted v2, maps the source URL, and keeps a 30-second fetch timeout", async () => {
    mockResponse(200, {
      success: true,
      data: { markdown: "# Hi", metadata: { sourceURL: "https://example.com/canonical" } },
    });

    const result = await provider.extract({ urls: [URL] });

    expect(result).toEqual({
      results: [{ url: "https://example.com/canonical", content: "# Hi" }],
      failedResults: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/scrape",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    expect(AbortSignal.timeout).toHaveBeenCalledExactlyOnceWith(30_000);
  });

  it.each([undefined, "basic", "advanced"] as const)(
    "always requests main-content filtering regardless of %s depth, and never sends depth",
    async (extractDepth) => {
      mockSuccess();

      await provider.extract({ urls: [URL], extractDepth });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body).toEqual({ url: URL, formats: ["markdown"], onlyMainContent: true });
      expect(body).not.toHaveProperty("extractDepth");
      expect(body).not.toHaveProperty("extract_depth");
    },
  );

  it("ignores a relevance query: Firecrawl has no passage-ranking option", async () => {
    mockSuccess();

    await provider.extract({ urls: [URL], query: "free allowance" });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ url: URL, formats: ["markdown"], onlyMainContent: true });
  });

  it("omits Authorization in keyless mode and accepts empty Markdown", async () => {
    mockSuccess("");

    const result = await provider.extract({ urls: [URL] });

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ "Content-Type": "application/json" });
    expect(result).toEqual({ results: [{ url: URL, content: "" }], failedResults: [] });
  });

  it.each(["https://api.firecrawl.dev", "http://localhost:3002/proxy/"])(
    "uses v2 and optional bearer authentication at %s",
    async (baseUrl) => {
      mockSuccess();
      const keyedProvider = new FirecrawlProvider(baseUrl, "fixture-key");

      await keyedProvider.extract({ urls: [URL] });

      expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl.replace(/\/$/, "")}/v2/scrape`);
      expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer fixture-key",
      });
    },
  );

  it.each([
    { label: "null envelope", payload: null, field: "response" },
    { label: "array envelope", payload: [], field: "response" },
    { label: "absent success", payload: { data: { markdown: "" } }, field: "success" },
    { label: "non-boolean success", payload: { success: "true", data: { markdown: "" } }, field: "success" },
    { label: "absent data", payload: { success: true }, field: "data" },
    { label: "null data", payload: { success: true, data: null }, field: "data" },
    { label: "absent Markdown", payload: { success: true, data: {} }, field: "data.markdown" },
    { label: "null Markdown", payload: { success: true, data: { markdown: null } }, field: "data.markdown" },
    { label: "non-string Markdown", payload: { success: true, data: { markdown: 7 } }, field: "data.markdown" },
    {
      label: "invalid source URL type",
      payload: { success: true, data: { markdown: "ok", metadata: { sourceURL: 7 } } },
      field: "data.metadata.sourceURL",
    },
  ])("rejects $label without retrying", async ({ payload, field }) => {
    mockResponse(200, payload);

    const result = await provider.extract({ urls: [URL] });

    expect(result.results).toEqual([]);
    expect(result.failedResults).toEqual([
      { url: URL, error: expect.stringContaining(`Invalid Firecrawl response: ${field}`) },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports invalid JSON without retrying", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not JSON", { status: 200 }));

    const result = await provider.extract({ urls: [URL] });

    expect(result.failedResults[0].error).toContain("Invalid Firecrawl response: expected JSON");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains provider error details in a successful HTTP response", async () => {
    mockResponse(200, {
      success: false,
      error: "Scrape blocked",
      details: { code: "ROBOTS_DENIED", message: "Target policy disallows extraction" },
    });

    const result = await provider.extract({ urls: [URL] });

    expect(result.failedResults[0].error).toContain("Firecrawl scrape unsuccessful: Scrape blocked");
    expect(result.failedResults[0].error).toContain("ROBOTS_DENIED");
    expect(result.failedResults[0].error).toContain("Target policy disallows extraction");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains error details in a malformed envelope", async () => {
    mockResponse(200, { error: "Upstream scraper unavailable" });

    const result = await provider.extract({ urls: [URL] });

    expect(result.failedResults[0].error).toContain("Invalid Firecrawl response");
    expect(result.failedResults[0].error).toContain("Upstream scraper unavailable");
  });

  it.each([401, 402, 500, 503])("reports HTTP %s details without retrying the POST", async (status) => {
    mockResponse(status, { error: { message: "Provider unavailable", code: "FIXTURE_ERROR" } });

    const result = await provider.extract({ urls: [URL] });

    expect(result.failedResults[0].error).toContain(`Firecrawl error (${status})`);
    expect(result.failedResults[0].error).toContain("Provider unavailable");
    expect(result.failedResults[0].error).toContain("FIXTURE_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { body: "Service temporarily unavailable", statusText: "Bad Gateway", detail: "Service temporarily unavailable" },
    { body: "", statusText: "Bad Gateway", detail: "Bad Gateway" },
  ])("retains non-JSON HTTP error details: $detail", async ({ body, statusText, detail }) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 502, statusText }));

    const result = await provider.extract({ urls: [URL] });

    expect(result.failedResults[0].error).toBe(`Firecrawl error (502): ${detail}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["Network unavailable", "The operation was aborted due to timeout"])(
    "does not retry fetch failures: %s",
    async (message) => {
      fetchMock.mockRejectedValueOnce(new Error(message));

      const result = await provider.extract({ urls: [URL] });

      expect(result.failedResults).toEqual([{ url: URL, error: message }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps successful URLs alongside explicit failures", async () => {
    mockSuccess("first");
    mockResponse(200, { success: true, data: {} });
    mockSuccess("third");

    const result = await provider.extract({ urls: [URL, "https://bad.example", "https://third.example"] });

    expect(result.results).toEqual([
      { url: URL, content: "first" },
      { url: "https://third.example", content: "third" },
    ]);
    expect(result.failedResults).toEqual([
      { url: "https://bad.example", error: expect.stringContaining("data.markdown") },
    ]);
  });

  it("waits for the entire five-URL batch before starting the next batch", async () => {
    const pending: ((value: Response) => void)[] = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`);

    const promise = provider.extract({ urls });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const resolve of pending.slice(0, 4)) {
      resolve(response(200, { success: true, data: { markdown: "ok" } }));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending[4](response(200, { success: true, data: { markdown: "ok" } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    pending[5](response(200, { success: true, data: { markdown: "ok" } }));

    const result = await promise;
    expect(result.results.map((entry) => entry.url)).toEqual(urls);
    expect(result.failedResults).toEqual([]);
  });

  describe("429 retry timing", () => {
    it.each([
      { label: "seconds", header: "2", waitMs: 2000 },
      { label: "fractional seconds", header: "1.5", waitMs: 1500 },
      { label: "fractional milliseconds rounded up", header: "0.0011", waitMs: 2 },
      { label: "trimmed seconds", header: " 2 ", waitMs: 2000 },
      { label: "zero seconds", header: "0", waitMs: 0 },
      { label: "HTTP date", header: "Fri, 20 Nov 2026 12:00:03 GMT", waitMs: 3000 },
      { label: "obsolete RFC 850 date", header: "Friday, 20-Nov-26 12:00:03 GMT", waitMs: 3000 },
      { label: "obsolete asctime date", header: "Fri Nov 20 12:00:03 2026", waitMs: 3000 },
      { label: "past HTTP date", header: "Fri, 20 Nov 2026 11:59:59 GMT", waitMs: 0 },
      { label: "missing header", header: undefined, waitMs: 5000 },
      { label: "null header", header: null, waitMs: 5000 },
      { label: "empty header", header: "", waitMs: 5000 },
      { label: "whitespace header", header: "  ", waitMs: 5000 },
      { label: "invalid header", header: "later", waitMs: 5000 },
      { label: "negative seconds", header: "-1", waitMs: 5000 },
      { label: "non-finite seconds", header: "Infinity", waitMs: 5000 },
      { label: "NaN seconds", header: "NaN", waitMs: 5000 },
      { label: "hexadecimal number", header: "0x10", waitMs: 5000 },
      { label: "exponential number", header: "1e2", waitMs: 5000 },
      { label: "non-HTTP date", header: "2026-11-20", waitMs: 5000 },
      { label: "invalid HTTP date", header: "Fri, 99 Nov 2026 12:00:03 GMT", waitMs: 5000 },
      { label: "impossible calendar date", header: "Fri, 31 Feb 2026 12:00:03 GMT", waitMs: 5000 },
      { label: "invalid weekday", header: "Foo, 20 Nov 2026 12:00:03 GMT", waitMs: 5000 },
      { label: "overflowing hours", header: "Fri, 20 Nov 2026 24:00:00 GMT", waitMs: 5000 },
      { label: "overflowing seconds", header: "Fri, 20 Nov 2026 12:00:61 GMT", waitMs: 5000 },
    ])("honors $label without retrying early", async ({ header, waitMs }) => {
      mockResponse(429, { error: "Slow down" }, header);
      mockSuccess();

      const promise = provider.extract({ urls: [URL] });
      await vi.advanceTimersByTimeAsync(0);
      if (waitMs > 0) {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(waitMs - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
      }

      expect(await promise).toEqual({ results: [{ url: URL, content: "ok" }], failedResults: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.mocked(AbortSignal.timeout).mock.calls).toEqual([[30_000], [30_000]]);
    });

    it("stops after exactly three attempts and preserves the final provider error", async () => {
      mockResponse(429, { error: "First limit" });
      mockResponse(429, { error: "Second limit" });
      mockResponse(429, { error: "Account limit reached" });

      const promise = provider.extract({ urls: [URL] });
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      const result = await promise;
      expect(result.failedResults[0].error).toContain("Firecrawl rate limit (429): Account limit reached");
      expect(result.failedResults[0].error).toContain("Exhausted after 3 attempts");
      expect(result.failedResults[0].error).not.toMatch(/1000|10\/min|free tier/i);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(vi.mocked(AbortSignal.timeout).mock.calls).toEqual([[30_000], [30_000], [30_000]]);
    });

    it.each(["16", "3600", "Fri, 20 Nov 2026 12:00:16 GMT"])(
      "fails rather than retrying early when %s exceeds the initial wait budget",
      async (header) => {
        mockResponse(429, { error: "Service busy" }, header);

        const result = await provider.extract({ urls: [URL] });

        expect(result.failedResults[0].error).toContain("Firecrawl rate limit (429): Service busy");
        expect(result.failedResults[0].error).toContain("exceeding the remaining 15000ms retry wait budget");
        await vi.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it.each(["4", "Fri, 20 Nov 2026 12:00:16 GMT", undefined, "invalid"])(
      "fails when a second wait (%s) cannot fit in the remaining per-URL budget",
      async (secondHeader) => {
        mockResponse(429, {}, "12");
        mockResponse(429, { error: "Still limited" }, secondHeader);

        const promise = provider.extract({ urls: [URL] });
        await vi.advanceTimersByTimeAsync(12_000);

        const result = await promise;
        expect(result.failedResults[0].error).toContain("exceeding the remaining 3000ms retry wait budget");
        expect(result.failedResults[0].error).toContain("Still limited");
        await vi.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it("allows exactly 15 seconds of total waiting before the third attempt", async () => {
      mockResponse(429, {}, "10");
      mockResponse(429, {}, "5");
      mockSuccess();

      const promise = provider.extract({ urls: [URL] });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      expect((await promise).results).toEqual([{ url: URL, content: "ok" }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("allows an explicit zero wait after the budget is fully spent", async () => {
      mockResponse(429, {}, "15");
      mockResponse(429, {}, "0");
      mockSuccess();

      const promise = provider.extract({ urls: [URL] });
      await vi.advanceTimersByTimeAsync(15_000);

      expect((await promise).results).toEqual([{ url: URL, content: "ok" }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("maintains a separate 15-second wait budget for each URL in a batch", async () => {
      const attempts = new Map<string, number>();
      fetchMock.mockImplementation(async (_endpoint, init) => {
        const { url } = JSON.parse(init?.body as string) as { url: string };
        const attempt = (attempts.get(url) ?? 0) + 1;
        attempts.set(url, attempt);
        return attempt === 1 ? response(429, {}, "15") : response(200, { success: true, data: { markdown: "ok" } });
      });

      const promise = provider.extract({ urls: [URL, "https://other.example"] });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      const result = await promise;
      expect(result.results).toHaveLength(2);
      expect(result.failedResults).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});
