import { describe, it, expect } from "vitest";

// Test the URL validation logic used by the web-reader tool
describe("URL validation", () => {
  function validateUrls(urls: string[]): string | null {
    for (const url of urls) {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `Invalid URL: "${url}". Must start with http:// or https://.`;
      }
      try {
        new URL(url);
      } catch {
        return `Invalid URL format: "${url}".`;
      }
    }
    return null;
  }

  it("accepts valid https URLs", () => {
    expect(validateUrls(["https://example.com"])).toBeNull();
  });

  it("accepts valid http URLs", () => {
    expect(validateUrls(["http://example.com"])).toBeNull();
  });

  it("accepts multiple valid URLs", () => {
    expect(validateUrls(["https://a.com", "https://b.com"])).toBeNull();
  });

  it("rejects URL without protocol", () => {
    expect(validateUrls(["example.com"])).toContain("Must start with http");
  });

  it("rejects ftp protocol", () => {
    expect(validateUrls(["ftp://example.com"])).toContain("Must start with http");
  });

  it("rejects malformed URL", () => {
    expect(validateUrls(["https://"])).toContain("Invalid URL format");
  });

  it("rejects when one URL is invalid among many", () => {
    expect(validateUrls(["https://ok.com", "not-a-url"])).toContain("Must start with http");
  });

  it("rejects empty string", () => {
    expect(validateUrls([""])).toContain("Must start with http");
  });
});
