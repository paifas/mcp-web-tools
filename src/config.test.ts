import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { loadConfig } from "./config.js";

const DEFAULT_ENV = {
  WEBTOOLS_SEARCH_PROVIDER: "searxng",
  SEARXNG_URL: "http://localhost:8080",
  // WEBTOOLS_EXTRACT_PROVIDER deliberately unset to test derivation
};

describe("loadConfig extract provider derivation", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
    delete process.env.WEBTOOLS_EXTRACT_PROVIDER;
    delete process.env.TAVILY_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_URL;
  });

  afterEach(() => {
    process.env = original;
  });

  it("derives firecrawl when search=searxng and extract is unset", () => {
    process.env = { ...process.env, ...DEFAULT_ENV };
    const c = loadConfig();
    expect(c.extractProvider).toBe("firecrawl");
    expect(c.searchProvider).toBe("searxng");
  });

  it("defaults search to searxng when WEBTOOLS_SEARCH_PROVIDER is unset", () => {
    process.env = { ...process.env, SEARXNG_URL: "http://localhost:8080" };
    delete process.env.WEBTOOLS_SEARCH_PROVIDER;
    const c = loadConfig();
    expect(c.searchProvider).toBe("searxng");
  });

  it("derives tavily when search=tavily and extract is unset", () => {
    process.env = { ...process.env, WEBTOOLS_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "k" };
    const c = loadConfig();
    expect(c.extractProvider).toBe("tavily");
  });

  it("respects explicit WEBTOOLS_EXTRACT_PROVIDER=none", () => {
    process.env = { ...process.env, ...DEFAULT_ENV, WEBTOOLS_EXTRACT_PROVIDER: "none" };
    const c = loadConfig();
    expect(c.extractProvider).toBe("none");
  });

  it("defaults FIRECRAWL_URL to https://api.firecrawl.dev", () => {
    process.env = { ...process.env, ...DEFAULT_ENV };
    const c = loadConfig();
    expect(c.firecrawlUrl).toBe("https://api.firecrawl.dev");
  });

  it("honors custom FIRECRAWL_URL", () => {
    process.env = { ...process.env, ...DEFAULT_ENV, FIRECRAWL_URL: "http://localhost:3002" };
    const c = loadConfig();
    expect(c.firecrawlUrl).toBe("http://localhost:3002");
  });

  it("defaults SEARXNG_URL to public instance when unset", () => {
    process.env = { ...process.env, WEBTOOLS_SEARCH_PROVIDER: "searxng" };
    delete process.env.SEARXNG_URL;
    const c = loadConfig();
    expect(c.searxngUrl).toBe("https://search.mdosch.de");
  });

  it("works with zero env vars (full zero-config)", () => {
    process.env = {};
    const c = loadConfig();
    expect(c.searchProvider).toBe("searxng");
    expect(c.searxngUrl).toBe("https://search.mdosch.de");
    expect(c.extractProvider).toBe("firecrawl");
  });

  it("requires TAVILY_API_KEY when extract=tavily", () => {
    process.env = {
      ...process.env,
      WEBTOOLS_SEARCH_PROVIDER: "searxng",
      SEARXNG_URL: "http://localhost:8080",
      WEBTOOLS_EXTRACT_PROVIDER: "tavily",
    };
    expect(() => loadConfig()).toThrow(/TAVILY_API_KEY/);
  });

  it("firecrawlApiKey is undefined in keyless mode", () => {
    process.env = { ...process.env, ...DEFAULT_ENV };
    const c = loadConfig();
    expect(c.firecrawlApiKey).toBeUndefined();
  });
});
