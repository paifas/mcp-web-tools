import type { SearchResponse, ExtractResponse, UsageResponse } from "../types.js";

/** Parameters common to all search providers */
export interface SearchParams {
  query: string;
  maxResults?: number;
  searchDepth?: "advanced" | "basic" | "fast" | "ultra-fast";
  topic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year";
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeAnswer?: boolean;
}

/** Parameters for extract providers */
export interface ExtractParams {
  urls: string[];
  extractDepth?: "basic" | "advanced";
  includeImages?: boolean;
}

/**
 * Interface that every search provider must implement.
 * Tavily is the first; Brave, SearXNG, Google can follow.
 *
 * `extract` and `getUsage` are optional: providers that don't support them
 * simply omit the method, and callers must guard with `?.` / `in` checks.
 */
export interface SearchProvider {
  readonly name: string;
  search(params: SearchParams): Promise<SearchResponse>;
  extract?(params: ExtractParams): Promise<ExtractResponse>;
  getUsage?(): Promise<UsageResponse>;
}
