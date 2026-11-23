import { describe, it, expect } from "vitest";
import { formatSearchResponse, formatExtractResponse, truncateContent } from "./index.js";
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

  it("keeps each page's extracted image URLs within that page's section", () => {
    const text = formatExtractResponse({
      results: [
        {
          url: "https://example.com/one",
          content: "First page",
          images: ["https://cdn.example.com/one.png", "https://cdn.example.com/diagram.svg?size=large&v=2"],
        },
        {
          url: "https://example.com/two",
          content: "Second page",
          images: ["https://cdn.example.com/two.png"],
        },
      ],
      failedResults: [],
    });

    const [firstPage, secondPage] = text.split("## https://example.com/two");
    expect(firstPage).toContain("## https://example.com/one");
    expect(firstPage).toContain("First page");
    expect(firstPage).toContain("### Images\n- https://cdn.example.com/one.png");
    expect(firstPage).toContain("https://cdn.example.com/diagram.svg?size=large&v=2");
    expect(firstPage).not.toContain("https://cdn.example.com/two.png");
    expect(secondPage).toContain("Second page");
    expect(secondPage).toContain("### Images\n- https://cdn.example.com/two.png");
    expect(secondPage).not.toContain("https://cdn.example.com/one.png");
  });

  it("omits the images section for absent or empty image lists", () => {
    const text = formatExtractResponse({
      results: [
        { url: "https://example.com/one", content: "First page" },
        { url: "https://example.com/two", content: "Second page", images: [] },
      ],
      failedResults: [],
    });

    expect(text).not.toContain("### Images");
    expect(text).toContain("First page");
    expect(text).toContain("Second page");
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

describe("truncateContent", () => {
  const para = (n: number, text: string) => Array.from({ length: n }, () => text).join("\n\n");

  it("returns content unchanged at or under the limit", () => {
    expect(truncateContent("short", 100)).toBe("short");
    expect(truncateContent("exactly10", 10)).toBe("exactly10");
  });

  it("is disabled with a limit of 0", () => {
    expect(truncateContent("x".repeat(50_000), 0)).toHaveLength(50_000);
  });

  it("cuts at the last paragraph break before the limit and appends a notice", () => {
    // 6 paragraphs of 10 chars joined by "\n\n": 10 + 5*12 = 70 chars.
    const content = para(6, "0123456789");
    const out = truncateContent(content, 40);

    // Paragraph 3 ends at index 34 (10 + 12 + 12). The next break is at 46, past the limit.
    expect(out.startsWith("0123456789\n\n0123456789\n\n0123456789")).toBe(true);
    expect(out).not.toContain("0123456789\n\n0123456789\n\n0123456789\n\n0123456789");
    expect(out).toMatch(/\[truncated: showing 34 of 70 characters\]$/);
  });

  it("falls back to a hard cut when no paragraph break sits in the first half", () => {
    // One 100-char paragraph with a single break near the very end.
    const content = `${"a".repeat(90)}\n\n${"b".repeat(10)}`;
    const out = truncateContent(content, 50);

    expect(out.startsWith("a".repeat(50))).toBe(true);
    expect(out).toMatch(/\[truncated: showing 50 of 102 characters\]$/);
  });

  it("hard-cuts a single paragraph with no breaks", () => {
    const out = truncateContent("z".repeat(1_000), 250);
    expect(out.startsWith("z".repeat(250))).toBe(true);
    expect(out).toMatch(/\[truncated: showing 250 of 1000 characters\]$/);
  });

  it("trims trailing whitespace from the kept prefix so the notice is not padded", () => {
    const content = `keep me\n\n\n\n${"x".repeat(200)}`;
    const out = truncateContent(content, 12);
    expect(out).toBe("keep me\n\n[truncated: showing 7 of 211 characters]");
  });

  it("reports the true original length, not the truncated one", () => {
    const out = truncateContent("q".repeat(123_456), 1_000);
    expect(out).toMatch(/of 123456 characters\]$/);
  });
});

describe("formatExtractResponse with a character limit", () => {
  it("applies the limit to each page independently and leaves URLs and images intact", () => {
    const text = formatExtractResponse(
      {
        results: [
          { url: "https://example.com/long", content: "L".repeat(300), images: ["https://example.com/i.png"] },
          { url: "https://example.com/short", content: "S".repeat(50) },
        ],
        failedResults: [],
      },
      100,
    );

    const [longPage, shortPage] = text.split("## https://example.com/short");
    expect(longPage).toContain("[truncated: showing 100 of 300 characters]");
    expect(longPage).toContain("### Images\n- https://example.com/i.png");
    expect(shortPage).toContain("S".repeat(50));
    expect(shortPage).not.toContain("truncated");
  });

  it("does not truncate by default (limit defaults to 0)", () => {
    const content = "D".repeat(30_000);
    const text = formatExtractResponse({ results: [{ url: "https://example.com", content }], failedResults: [] });
    expect(text).toContain(content);
    expect(text).not.toContain("truncated");
  });
});
