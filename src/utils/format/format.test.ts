import { describe, it, expect } from "vitest";
import { formatSearchResponse, formatExtractResponse } from "./index.js";
import type { SearchResponse, ExtractResponse } from "../../types.js";

const searchResponse: SearchResponse = {
  query: "test",
  answer: "AI summary here",
  results: [
    { title: "Result One", url: "https://example.com/1", snippet: "Snippet one", score: 0.9 },
    { title: "Result Two", url: "https://example.com/2", snippet: "Snippet two", score: 0.8 },
  ],
  responseTime: 1234,
};

describe("formatSearchResponse", () => {
  it("includes answer, results, response time, and sources", () => {
    const text = formatSearchResponse(searchResponse);
    expect(text).toContain("AI summary here");
    expect(text).toContain("[Result One](https://example.com/1)");
    expect(text).toContain("> Snippet one");
    expect(text).toContain("Response time: 1234ms");
    expect(text).toContain("Sources:");
  });

  it("omits answer when not present", () => {
    const noAnswer = { ...searchResponse, answer: undefined };
    const text = formatSearchResponse(noAnswer);
    expect(text).not.toContain("AI summary here");
    expect(text).toContain("[Result One](https://example.com/1)");
  });

  it("omits response time when null", () => {
    const noTime = { ...searchResponse, responseTime: undefined };
    const text = formatSearchResponse(noTime);
    expect(text).not.toContain("Response time");
  });
});

describe("formatExtractResponse", () => {
  it("formats results with URL and content", () => {
    const response: ExtractResponse = {
      results: [
        { url: "https://example.com/page1", content: "Page one content" },
        { url: "https://example.com/page2", content: "Page two content" },
      ],
      failedResults: [],
      responseTime: 500,
    };
    const text = formatExtractResponse(response);
    expect(text).toContain("## https://example.com/page1");
    expect(text).toContain("Page one content");
    expect(text).toContain("Response time: 500ms");
  });

  it("shows failed results", () => {
    const response: ExtractResponse = {
      results: [{ url: "https://example.com/ok", content: "OK" }],
      failedResults: [{ url: "https://example.com/bad", error: "Timeout" }],
      responseTime: undefined,
    };
    const text = formatExtractResponse(response);
    expect(text).toContain("Failed:");
    expect(text).toContain("https://example.com/bad: Timeout");
  });

  it("handles empty results", () => {
    const response: ExtractResponse = {
      results: [],
      failedResults: [],
      responseTime: undefined,
    };
    const text = formatExtractResponse(response);
    expect(text).toBe("");
  });
});
