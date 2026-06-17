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
const SUPPORTED_PROVIDERS = ["tavily", "searxng"] as const;
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

/** Upper bound for the per-call maxResults zod schema (kept in sync with web-search tool). */
const MAX_RESULTS_LIMIT = 20;

export interface ServerConfig {
  searchProvider: ProviderName;
  /** Required when searchProvider = "tavily". */
  tavilyApiKey?: string;
  /** Required when searchProvider = "searxng". */
  searxngUrl?: string;
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
  const searchProvider = (process.env.WEBTOOLS_SEARCH_PROVIDER ?? "tavily") as ProviderName;
  if (!SUPPORTED_PROVIDERS.includes(searchProvider)) {
    throw new Error(
      `Invalid WEBTOOLS_SEARCH_PROVIDER value: "${process.env.WEBTOOLS_SEARCH_PROVIDER}". ` +
        `Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }

  // Provider-specific required env vars are validated here so failures surface at startup,
  // not on the first tool call.
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const searxngUrl = process.env.SEARXNG_URL;
  if (searchProvider === "tavily" && !tavilyApiKey) {
    throw new Error(
      "TAVILY_API_KEY environment variable is required when WEBTOOLS_SEARCH_PROVIDER=tavily. Get one at https://tavily.com",
    );
  }
  if (searchProvider === "searxng" && !searxngUrl) {
    throw new Error("SEARXNG_URL environment variable is required when WEBTOOLS_SEARCH_PROVIDER=searxng.");
  }

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
