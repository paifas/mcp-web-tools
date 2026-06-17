/** Normalized search result from any provider */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

/** Normalized search response */
export interface SearchResponse {
  query: string;
  answer?: string;
  results: SearchResult[];
  responseTime?: number;
}

/** Normalized extract result */
export interface ExtractResult {
  url: string;
  content: string;
  images?: string[];
}

/** Normalized extract response */
export interface ExtractResponse {
  results: ExtractResult[];
  failedResults: { url: string; error: string }[];
  responseTime?: number;
}

/** Normalized usage/balance response */
export interface UsageResponse {
  provider: string;
  plan?: string;
  used: number;
  limit: number;
  remaining: number;
  /** Named breakdown buckets, e.g. { search: 27, extract: 6 } */
  breakdown: Record<string, number>;
}
