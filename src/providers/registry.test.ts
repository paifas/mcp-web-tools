import { describe, it, expect, vi, afterEach } from "vitest";
import { createSearchProvider, createExtractProvider } from "./registry.js";
import type { ServerConfig } from "../config.js";

function baseConfig(overrides: Partial<ServerConfig>): ServerConfig {
  return {
    searchProvider: "searxng",
    searxngUrl: "http://localhost:8080",
    extractProvider: "firecrawl",
    firecrawlUrl: "https://api.firecrawl.dev",
    defaultMaxResults: 5,
    defaultSearchDepth: "basic",
    cacheTtl: 60,
    cacheMaxEntries: 100,
    cacheSweepIntervalMs: 60_000,
    serverName: "test",
    serverVersion: "0.0.0",
    ...overrides,
  } as ServerConfig;
}

describe("createSearchProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns SearXNGProvider for searxng", () => {
    const p = createSearchProvider(baseConfig({ searchProvider: "searxng" }));
    expect(p.name).toBe("searxng");
  });

  it("returns TavilySearchProvider for tavily", () => {
    const p = createSearchProvider(baseConfig({ searchProvider: "tavily", tavilyApiKey: "k" }));
    expect(p.name).toBe("tavily");
  });

  it("throws when tavily key is missing", () => {
    expect(() => createSearchProvider(baseConfig({ searchProvider: "tavily", tavilyApiKey: undefined }))).toThrow(
      /TAVILY_API_KEY/,
    );
  });
});

describe("createExtractProvider", () => {
  it("returns null for none", () => {
    expect(createExtractProvider(baseConfig({ extractProvider: "none" }))).toBeNull();
  });

  it("returns FirecrawlProvider for firecrawl (keyless by default)", () => {
    const p = createExtractProvider(baseConfig({ extractProvider: "firecrawl", firecrawlApiKey: undefined }));
    expect(p?.name).toBe("firecrawl");
  });

  it("returns TavilySearchProvider for tavily when key is present", () => {
    const p = createExtractProvider(baseConfig({ extractProvider: "tavily", tavilyApiKey: "k" }));
    expect(p?.name).toBe("tavily");
  });

  it("throws when tavily extract is selected without key", () => {
    expect(() => createExtractProvider(baseConfig({ extractProvider: "tavily", tavilyApiKey: undefined }))).toThrow(
      /TAVILY_API_KEY/,
    );
  });
});
