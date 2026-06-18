import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Supported search providers. Driven by WEBTOOLS_SEARCH_PROVIDER env var. */
const SUPPORTED_SEARCH_PROVIDERS = ["tavily", "searxng"] as const;
export type SearchProviderName = (typeof SUPPORTED_SEARCH_PROVIDERS)[number];

/** Supported extract providers. Driven by WEBTOOLS_EXTRACT_PROVIDER env var. */
const SUPPORTED_EXTRACT_PROVIDERS = ["tavily", "firecrawl", "none"] as const;
export type ExtractProviderName = (typeof SUPPORTED_EXTRACT_PROVIDERS)[number];

/** Upper bound for the per-call maxResults zod schema (kept in sync with web-search tool). */
const MAX_RESULTS_LIMIT = 20;

const DEFAULT_FIRECRAWL_URL = "https://api.firecrawl.dev";

/**
 * Default public SearXNG instance. Used when the user sets no SEARXNG_URL at all,
 * so the server works out-of-the-box with zero config. Public instances are
 * volunteer-operated — availability and rate limits are not guaranteed.
 * Override with SEARXNG_URL (local container, different public instance, etc.).
 */
const DEFAULT_SEARXNG_URL = "https://search.mdosch.de";

export interface ServerConfig {
  searchProvider: SearchProviderName;
  /** Required when searchProvider = "tavily". */
  tavilyApiKey?: string;
  /** Required when searchProvider = "searxng". */
  searxngUrl?: string;
  /**
   * Extract provider. Derived when unset: tavily search → tavily extract,
   * searxng search → firecrawl extract (keyless works with no env vars).
   */
  extractProvider: ExtractProviderName;
  /** Default: https://api.firecrawl.dev. Accepts any HTTP(S) URL. */
  firecrawlUrl: string;
  /** Optional in all modes. Keyless mode (unset) sends no Authorization header. */
  firecrawlApiKey?: string;
  /** Optional GitHub token to lift rate limits (60/hr → 5000/hr) for github_* tools. */
  githubToken?: string;
  defaultMaxResults: number;
  defaultSearchDepth: "advanced" | "basic" | "fast" | "ultra-fast";
  cacheTtl: number;
  cacheMaxEntries: number;
  cacheSweepIntervalMs: number;
  serverName: string;
  serverVersion: string;
}

function parseNonNegInt(value: string | undefined, fallback: number, label: string): number {
  const parsed = parseInt(value ?? String(fallback), 10);
  if (Number.isNaN(parsed) || parsed < 0 || !Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: "${value}". Must be a non-negative integer.`);
  }
  return parsed;
}

export function loadConfig(): ServerConfig {
  // Zero-config default is the free stack: SearXNG search + Firecrawl keyless extract.
  // Works out of the box with no env vars — uses a public SearXNG instance by default.
  // Set SEARXNG_URL to point at your own instance or a different public one.
  const searchProvider = (process.env.WEBTOOLS_SEARCH_PROVIDER ?? "searxng") as SearchProviderName;
  if (!SUPPORTED_SEARCH_PROVIDERS.includes(searchProvider)) {
    throw new Error(
      `Invalid WEBTOOLS_SEARCH_PROVIDER value: "${process.env.WEBTOOLS_SEARCH_PROVIDER}". ` +
        `Supported: ${SUPPORTED_SEARCH_PROVIDERS.join(", ")}`,
    );
  }

  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const searxngUrl = process.env.SEARXNG_URL ?? DEFAULT_SEARXNG_URL;
  if (searchProvider === "tavily" && !tavilyApiKey) {
    throw new Error(
      "TAVILY_API_KEY environment variable is required when WEBTOOLS_SEARCH_PROVIDER=tavily. Get one at https://tavily.com",
    );
  }

  // Extract provider: explicit env wins, otherwise derive from search provider.
  // searxng → firecrawl (keyless just works with no env vars)
  // tavily  → tavily (key reuse)
  const derivedDefault: ExtractProviderName = searchProvider === "tavily" ? "tavily" : "firecrawl";
  const extractProviderRaw = process.env.WEBTOOLS_EXTRACT_PROVIDER ?? derivedDefault;
  if (!SUPPORTED_EXTRACT_PROVIDERS.includes(extractProviderRaw as ExtractProviderName)) {
    throw new Error(
      `Invalid WEBTOOLS_EXTRACT_PROVIDER value: "${process.env.WEBTOOLS_EXTRACT_PROVIDER}". ` +
        `Supported: ${SUPPORTED_EXTRACT_PROVIDERS.join(", ")}`,
    );
  }
  const extractProvider = extractProviderRaw as ExtractProviderName;

  const firecrawlUrl = process.env.FIRECRAWL_URL ?? DEFAULT_FIRECRAWL_URL;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

  // Eager validation so misconfig fails at startup, not on first tool call.
  if (extractProvider === "tavily" && !tavilyApiKey) {
    throw new Error(
      "TAVILY_API_KEY is required when WEBTOOLS_EXTRACT_PROVIDER=tavily. " +
        "Use a different extract provider or set the key.",
    );
  }
  // firecrawl: no requirements — keyless mode works with no env vars.
  // none: no requirements; web_read will not be registered.

  const defaultMaxResults = parseInt(process.env.WEBTOOLS_MAX_RESULTS ?? "5", 10);
  if (Number.isNaN(defaultMaxResults) || defaultMaxResults < 1) {
    throw new Error(
      `Invalid WEBTOOLS_MAX_RESULTS value: "${process.env.WEBTOOLS_MAX_RESULTS}". Must be a positive integer.`,
    );
  }
  if (defaultMaxResults > MAX_RESULTS_LIMIT) {
    throw new Error(
      `Invalid WEBTOOLS_MAX_RESULTS value: "${process.env.WEBTOOLS_MAX_RESULTS}". Must be <= ${MAX_RESULTS_LIMIT} (matches the per-call zod schema).`,
    );
  }

  const defaultSearchDepth = (process.env.WEBTOOLS_SEARCH_DEPTH ?? "basic") as
    | "advanced"
    | "basic"
    | "fast"
    | "ultra-fast";

  const cacheTtl = parseNonNegInt(process.env.WEBTOOLS_CACHE_TTL, 3600, "WEBTOOLS_CACHE_TTL");
  const cacheMaxEntries = parseNonNegInt(process.env.WEBTOOLS_CACHE_MAX_ENTRIES, 100, "WEBTOOLS_CACHE_MAX_ENTRIES");
  const cacheSweepIntervalMs = parseNonNegInt(
    process.env.WEBTOOLS_CACHE_SWEEP_INTERVAL_MS,
    5 * 60 * 1000,
    "WEBTOOLS_CACHE_SWEEP_INTERVAL_MS",
  );

  return {
    searchProvider,
    tavilyApiKey,
    searxngUrl,
    extractProvider,
    firecrawlUrl,
    firecrawlApiKey,
    githubToken: process.env.GITHUB_TOKEN,
    defaultMaxResults,
    defaultSearchDepth,
    cacheTtl,
    cacheMaxEntries,
    cacheSweepIntervalMs,
    serverName: "mcp-web-tools",
    serverVersion: getPackageVersion(),
  };
}
