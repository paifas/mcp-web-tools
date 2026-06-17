import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TavilyClient, TavilyError } from "./index.js";

describe("TavilyClient", () => {
  let client: TavilyClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new TavilyClient("test-key", 5000);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(status: number, body: unknown) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body),
    });
  }

  describe("search", () => {
    it("returns parsed response", async () => {
      const body = { query: "test", results: [], response_time: 100 };
      mockResponse(200, body);

      const result = await client.search({ query: "test" });
      expect(result.query).toBe("test");
      expect(result.results).toEqual([]);
    });

    it("throws TavilyError on 401", async () => {
      mockResponse(401, { error: "bad key" });
      await expect(client.search({ query: "test" })).rejects.toThrow("Invalid Tavily API key");
    });
  });

  describe("extract", () => {
    it("returns parsed response", async () => {
      const body = { results: [{ url: "https://x.com", raw_content: "hi" }], failed_results: [] };
      mockResponse(200, body);

      const result = await client.extract({ urls: ["https://x.com"] });
      expect(result.results).toHaveLength(1);
    });
  });

  describe("retry logic", () => {
    it("retries on 429 and succeeds on second attempt", async () => {
      const rateLimitBody = { error: "rate limited" };
      const successBody = { query: "test", results: [], response_time: 100 };

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve(JSON.stringify(rateLimitBody)),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(successBody),
        });

      vi.useFakeTimers();
      const promise = client.search({ query: "test" });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      expect(result.query).toBe("test");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("retries on 500 and gives up after MAX_RETRIES", { timeout: 15000 }, async () => {
      const errorBody = { error: "internal" };
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify(errorBody)),
      });

      vi.useFakeTimers();
      // Attach the rejection handler synchronously so the promise never emits an
      // unhandledRejection event while fake timers advance.
      const settled = client.search({ query: "test" }).then(
        () => new Error("expected rejection, got success"),
        (e: unknown) => e,
      );
      await vi.advanceTimersByTimeAsync(15000);
      vi.useRealTimers();

      const error = await settled;
      expect(error).toBeInstanceOf(TavilyError);
      expect((error as TavilyError).message).toContain("Tavily API error (500)");
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("does not retry on 401", async () => {
      mockResponse(401, { error: "unauthorized" });
      await expect(client.search({ query: "test" })).rejects.toThrow("Invalid Tavily API key");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getUsage", () => {
    it("returns parsed usage response", async () => {
      const body = {
        key: {
          usage: 10,
          limit: 1000,
          search_usage: 8,
          extract_usage: 2,
          crawl_usage: 0,
          map_usage: 0,
          research_usage: 0,
        },
        account: {
          current_plan: "Researcher",
          plan_usage: 10,
          plan_limit: 1000,
          paygo_usage: 0,
          paygo_limit: 0,
          search_usage: 8,
          extract_usage: 2,
          crawl_usage: 0,
          map_usage: 0,
          research_usage: 0,
        },
      };
      mockResponse(200, body);

      const result = await client.getUsage();
      expect(result.key.usage).toBe(10);
      expect(result.account.current_plan).toBe("Researcher");
    });
  });
});
