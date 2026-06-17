import type { ServerConfig } from "../config.js";
import type { SearchProvider } from "./search-provider.js";
import { TavilySearchProvider } from "./tavily/tavily-search.js";
import { SearXNGProvider } from "./searxng/searxng.js";

/**
 * Build the configured SearchProvider from ServerConfig.
 *
 * Provider-specific required fields (TAVILY_API_KEY, SEARXNG_URL) are validated
 * eagerly here so a misconfiguration fails at startup, not on first tool call.
 */
export function createProvider(config: ServerConfig): SearchProvider {
  switch (config.searchProvider) {
    case "tavily": {
      if (!config.tavilyApiKey) {
        throw new Error("TAVILY_API_KEY is required for the tavily provider");
      }
      return new TavilySearchProvider(config.tavilyApiKey);
    }
    case "searxng": {
      if (!config.searxngUrl) {
        throw new Error("SEARXNG_URL is required for the searxng provider");
      }
      return new SearXNGProvider(config.searxngUrl);
    }
    // Exhaustiveness check: if a new provider is added to ProviderName without
    // a case here, TypeScript flags it at compile time.
    default: {
      const _exhaustive: never = config.searchProvider;
      throw new Error(`Unhandled search provider: ${_exhaustive}`);
    }
  }
}
