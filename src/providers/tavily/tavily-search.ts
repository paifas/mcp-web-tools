import type { SearchResponse, ExtractResponse } from "../../types.js";
import type { SearchProvider, SearchParams, ExtractParams } from "../search-provider.js";
import { TavilyClient, TavilyError } from "./client/index.js";

/**
 * Tavily implementation of the SearchProvider interface.
 */
export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily";
  private readonly client: TavilyClient;

  constructor(apiKey: string) {
    this.client = new TavilyClient(apiKey);
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const response = await this.client.search({
      query: params.query,
      search_depth: params.searchDepth,
      max_results: params.maxResults,
      topic: params.topic,
      time_range: params.timeRange,
      start_date: params.startDate,
      end_date: params.endDate,
      include_answer: params.includeAnswer ?? true,
      include_domains: params.includeDomains,
      exclude_domains: params.excludeDomains,
    });

    return {
      query: response.query,
      answer: response.answer,
      results: response.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
      })),
      responseTime: response.response_time,
    };
  }

  async extract(params: ExtractParams): Promise<ExtractResponse> {
    const response = await this.client.extract({
      urls: params.urls,
      extract_depth: params.extractDepth,
      include_images: params.includeImages,
    });

    return {
      results: response.results.map((r) => ({
        url: r.url,
        content: r.raw_content,
        images: r.images,
      })),
      failedResults: response.failed_results.map((f) => ({
        url: f.url,
        error: f.error,
      })),
      responseTime: response.response_time,
    };
  }
}

// Re-export for convenience
export { TavilyError };
