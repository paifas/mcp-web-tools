import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider } from "./tavily-search.js";
import { formatExtractResponse, formatSearchResponse } from "../../utils/format/index.js";

describe("TavilySearchProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let provider: TavilySearchProvider;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    provider = new TavilySearchProvider("fixture-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockResponse(body: unknown) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  }

  it("normalizes the real search response from seconds to milliseconds", async () => {
    mockResponse({
      query: "fixture query",
      answer: "Fixture answer",
      results: [{ title: "Source", url: "https://example.com", content: "Snippet", score: 0.9 }],
      response_time: 1.25,
    });

    const result = await provider.search({ query: "fixture query" });

    expect(result).toEqual({
      query: "fixture query",
      answer: "Fixture answer",
      results: [{ title: "Source", url: "https://example.com", snippet: "Snippet", score: 0.9 }],
      responseTime: 1250,
    });
    expect(formatSearchResponse(result)).toContain("Response time: 1250ms");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.tavily.com/search");
  });

  it("retains requested images, failures, and millisecond timing through extraction and formatting", async () => {
    mockResponse({
      results: [
        {
          url: "https://example.com/article",
          raw_content: "Article",
          images: ["https://example.com/photo.png", "https://cdn.example.com/diagram.svg?size=large"],
        },
      ],
      failed_results: [{ url: "https://failed.example", error: "Unavailable" }],
      response_time: 0.25,
    });

    const result = await provider.extract({
      urls: ["https://example.com/article", "https://failed.example"],
      includeImages: true,
      extractDepth: "advanced",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      urls: ["https://example.com/article", "https://failed.example"],
      include_images: true,
      extract_depth: "advanced",
    });
    expect(result).toEqual({
      results: [
        {
          url: "https://example.com/article",
          content: "Article",
          images: ["https://example.com/photo.png", "https://cdn.example.com/diagram.svg?size=large"],
        },
      ],
      failedResults: [{ url: "https://failed.example", error: "Unavailable" }],
      responseTime: 250,
    });
    const text = formatExtractResponse(result);
    expect(text).toContain("## https://example.com/article");
    expect(text).toContain("https://example.com/photo.png");
    expect(text).toContain("https://cdn.example.com/diagram.svg?size=large");
    expect(text).toContain("https://failed.example: Unavailable");
    expect(text).toContain("Response time: 250ms");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.tavily.com/extract");
  });

  it("sends query together with chunks_per_source so Tavily returns passages, not the page", async () => {
    // Mirrors the shape measured live on 2026-11-23: ~2.1 KB of passages vs ~71 KB for the page.
    mockResponse({
      results: [
        { url: "https://docs.example.com/credits", raw_content: "Passage one.[...]Passage two.[...]Passage three." },
      ],
      failed_results: [],
      response_time: 0.11,
    });

    const result = await provider.extract({
      urls: ["https://docs.example.com/credits"],
      query: "monthly free allowance",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      urls: ["https://docs.example.com/credits"],
      query: "monthly free allowance",
      chunks_per_source: 3,
    });
    expect(result.results[0]?.content).toContain("[...]");
    expect(result.results[0]?.content).not.toContain("Failed");
  });

  it("never sends chunks_per_source without a query", async () => {
    mockResponse({ results: [], failed_results: [] });

    await provider.extract({ urls: ["https://example.com"] });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("chunks_per_source");
    expect(body).not.toHaveProperty("query");
  });

  it.each([
    { label: "omitted", seconds: undefined, milliseconds: undefined },
    { label: "null", seconds: null, milliseconds: undefined },
    { label: "zero", seconds: 0, milliseconds: 0 },
  ])("handles $label timings without inventing a duration", async ({ seconds, milliseconds }) => {
    mockResponse({ query: "fixture", results: [], response_time: seconds });
    mockResponse({ results: [], failed_results: [], response_time: seconds });

    const search = await provider.search({ query: "fixture" });
    const extract = await provider.extract({ urls: ["https://example.com"] });

    expect(search.responseTime).toBe(milliseconds);
    expect(extract.responseTime).toBe(milliseconds);
    if (milliseconds === undefined) {
      expect(formatSearchResponse(search)).not.toContain("Response time");
      expect(formatExtractResponse(extract)).not.toContain("Response time");
    } else {
      expect(formatSearchResponse(search)).toContain("Response time: 0ms");
      expect(formatExtractResponse(extract)).toContain("Response time: 0ms");
    }
  });
});
