import type { ExtractResponse } from "../types.js";

/** Parameters for extract providers */
export interface ExtractParams {
  urls: string[];
  extractDepth?: "basic" | "advanced";
  includeImages?: boolean;
  /**
   * What the caller is looking for on the page. Providers that support
   * relevance ranking (Tavily) return a few matching passages instead of the
   * whole page, at no extra cost. Others ignore it.
   */
  query?: string;
}

/**
 * Provider interface for content extraction (web_read).
 *
 * Independent from SearchProvider so search and extract backends can be
 * configured separately (e.g. SearXNG for search + Firecrawl for extract).
 */
export interface ExtractProvider {
  readonly name: string;
  extract(params: ExtractParams): Promise<ExtractResponse>;
}
