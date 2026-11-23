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

describe("strict configuration validation", () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {};
  });
  afterEach(() => {
    process.env = original;
  });

  it.each(["5garbage", "1.5", "-1", "", " 5", "1e2", "9007199254740992"])(
    "rejects malformed numeric configuration %s",
    (value) => {
      for (const name of [
        "WEBTOOLS_MAX_RESULTS",
        "WEBTOOLS_CACHE_TTL",
        "WEBTOOLS_CACHE_MAX_ENTRIES",
        "WEBTOOLS_CACHE_SWEEP_INTERVAL_MS",
        "WEBTOOLS_MAX_CHARS",
      ]) {
        process.env = { [name]: value };
        expect(() => loadConfig()).toThrow(name);
      }
    },
  );
  it("keeps zero-disable cache controls", () => {
    process.env = { WEBTOOLS_CACHE_TTL: "0", WEBTOOLS_CACHE_MAX_ENTRIES: "0", WEBTOOLS_CACHE_SWEEP_INTERVAL_MS: "0" };
    expect(loadConfig()).toMatchObject({ cacheTtl: 0, cacheMaxEntries: 0, cacheSweepIntervalMs: 0 });
  });
  it("defaults the page character limit to 20000 and accepts 0 to disable it", () => {
    expect(loadConfig().maxChars).toBe(20_000);
    process.env = { WEBTOOLS_MAX_CHARS: "0" };
    expect(loadConfig().maxChars).toBe(0);
    process.env = { WEBTOOLS_MAX_CHARS: "5000" };
    expect(loadConfig().maxChars).toBe(5_000);
  });
  it.each(["0", "21"])("rejects out-of-range default max results %s", (value) => {
    process.env.WEBTOOLS_MAX_RESULTS = value;
    expect(() => loadConfig()).toThrow("WEBTOOLS_MAX_RESULTS");
  });
  it("rejects unsupported depth and timer overflow", () => {
    process.env.WEBTOOLS_SEARCH_DEPTH = "garbage";
    expect(() => loadConfig()).toThrow("WEBTOOLS_SEARCH_DEPTH");
    process.env = { WEBTOOLS_CACHE_SWEEP_INTERVAL_MS: "2147483648" };
    expect(() => loadConfig()).toThrow("timer limit");
  });
  it.each(["not-a-url", "ftp://example.com", "https://user:secret@example.com"])(
    "rejects invalid active base URL %s",
    (url) => {
      process.env.SEARXNG_URL = url;
      expect(() => loadConfig()).toThrow("SEARXNG_URL");
      process.env = { FIRECRAWL_URL: url };
      expect(() => loadConfig()).toThrow("FIRECRAWL_URL");
    },
  );
  it("allows local endpoints and ignores unused provider settings", () => {
    process.env = { SEARXNG_URL: "http://localhost:8080", FIRECRAWL_URL: "http://127.0.0.1:3002" };
    expect(loadConfig().firecrawlUrl).toBe("http://127.0.0.1:3002");
    process.env = {
      WEBTOOLS_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: "fake",
      SEARXNG_URL: "invalid",
      FIRECRAWL_URL: "invalid",
    };
    expect(loadConfig().searchProvider).toBe("tavily");
  });
  it("does not leak base URL credentials in configuration errors", () => {
    process.env.FIRECRAWL_URL = "https://user:secret@example.com";
    expect(() => loadConfig()).toThrow("FIRECRAWL_URL");
    try {
      loadConfig();
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });
});
