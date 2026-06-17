import type { SearchResponse, UsageResponse } from "../types.js";

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

/**
 * Interface that every search provider must implement.
 *
 * Search and extract are now decoupled — see ExtractProvider. `getUsage` is
 * optional: providers without a credit/usage system omit it, and callers
 * guard with `?.`.
 */
export interface SearchProvider {
  readonly name: string;
  search(params: SearchParams): Promise<SearchResponse>;
  getUsage?(): Promise<UsageResponse>;
}
