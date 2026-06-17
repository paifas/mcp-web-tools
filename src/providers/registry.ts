import type { ServerConfig } from "../config.js";
import type { SearchProvider } from "./search-provider.js";
import type { ExtractProvider } from "./extract-provider.js";
import { TavilySearchProvider } from "./tavily/tavily-search.js";
import { SearXNGProvider } from "./searxng/searxng.js";
import { FirecrawlProvider } from "./firecrawl/firecrawl.js";

/**
 * Build the configured SearchProvider from ServerConfig.
 *
 * Provider-specific required fields (TAVILY_API_KEY, SEARXNG_URL) are validated
 * eagerly in config.ts so a misconfiguration fails at startup, not on first
 * tool call. This factory only asserts them for type narrowing.
 */
export function createSearchProvider(config: ServerConfig): SearchProvider {
  switch (config.searchProvider) {
    case "tavily": {
      if (!config.tavilyApiKey) {
        throw new Error("TAVILY_API_KEY is required for the tavily search provider");
      }
      return new TavilySearchProvider(config.tavilyApiKey);
    }
    case "searxng": {
      if (!config.searxngUrl) {
        throw new Error("SEARXNG_URL is required for the searxng search provider");
      }
      return new SearXNGProvider(config.searxngUrl);
    }
    default: {
      const _exhaustive: never = config.searchProvider;
      throw new Error(`Unhandled search provider: ${_exhaustive}`);
    }
  }
}

/**
 * Build the configured ExtractProvider from ServerConfig, or null when the
 * user has disabled extraction (`WEBTOOLS_EXTRACT_PROVIDER=none`).
 */
export function createExtractProvider(config: ServerConfig): ExtractProvider | null {
  switch (config.extractProvider) {
    case "none":
      return null;
    case "tavily": {
      if (!config.tavilyApiKey) {
        throw new Error("TAVILY_API_KEY is required for the tavily extract provider");
      }
      // TavilySearchProvider implements both interfaces.
      return new TavilySearchProvider(config.tavilyApiKey);
    }
    case "firecrawl": {
      // Keyless works with no key. Self-hosted: set FIRECRAWL_URL. No validation needed.
      return new FirecrawlProvider(config.firecrawlUrl, config.firecrawlApiKey);
    }
    default: {
      const _exhaustive: never = config.extractProvider;
      throw new Error(`Unhandled extract provider: ${_exhaustive}`);
    }
  }
}
