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

export interface ServerConfig {
  searchProvider: ProviderName;
  /** Required when searchProvider = "tavily". */
  tavilyApiKey?: string;
  /** Required when searchProvider = "searxng". */
  searxngUrl?: string;
  defaultMaxResults: number;
  defaultSearchDepth: "advanced" | "basic" | "fast" | "ultra-fast";
  cacheTtl: number;
  serverName: string;
  serverVersion: string;
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

  const defaultSearchDepth = (process.env.WEBTOOLS_SEARCH_DEPTH ?? "basic") as
    | "advanced"
    | "basic"
    | "fast"
    | "ultra-fast";

  const cacheTtl = parseInt(process.env.WEBTOOLS_CACHE_TTL ?? "3600", 10);
  if (Number.isNaN(cacheTtl) || cacheTtl < 0) {
    throw new Error(
      `Invalid WEBTOOLS_CACHE_TTL value: "${process.env.WEBTOOLS_CACHE_TTL}". Must be a non-negative integer (seconds).`,
    );
  }

  return {
    searchProvider,
    tavilyApiKey,
    searxngUrl,
    defaultMaxResults,
    defaultSearchDepth,
    cacheTtl,
    serverName: "mcp-web-tools",
    serverVersion: getPackageVersion(),
  };
}
