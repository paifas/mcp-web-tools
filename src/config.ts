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

export interface ServerConfig {
  tavilyApiKey: string;
  defaultMaxResults: number;
  defaultSearchDepth: "advanced" | "basic" | "fast" | "ultra-fast";
  cacheTtl: number;
  serverName: string;
  serverVersion: string;
}

export function loadConfig(): ServerConfig {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    throw new Error("TAVILY_API_KEY environment variable is required. Get one at https://tavily.com");
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
    tavilyApiKey,
    defaultMaxResults,
    defaultSearchDepth,
    cacheTtl,
    serverName: "mcp-web-tools",
    serverVersion: getPackageVersion(),
  };
}
