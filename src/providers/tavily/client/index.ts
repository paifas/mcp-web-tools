/** Tavily API error types */
export class TavilyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TavilyError";
  }
}

/** Raw Tavily search API response */
export interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: {
    title: string;
    url: string;
    content: string;
    score: number;
  }[];
  response_time?: number;
}

/** Raw Tavily extract API response */
export interface TavilyExtractResponse {
  results: {
    url: string;
    raw_content: string;
    images?: string[];
  }[];
  failed_results: {
    url: string;
    error: string;
  }[];
  response_time?: number;
}

/** Parameters for the Tavily extract request body */
export interface TavilyExtractParams {
  urls: string[];
  extract_depth?: "basic" | "advanced";
  include_images?: boolean;
}

/** Parameters for the Tavily search request body */
export interface TavilySearchParams {
  query: string;
  search_depth?: "advanced" | "basic" | "fast" | "ultra-fast";
  max_results?: number;
  topic?: "general" | "news" | "finance";
  time_range?: "day" | "week" | "month" | "year";
  start_date?: string;
  end_date?: string;
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

/** Usage response from Tavily API */
export interface TavilyUsageResponse {
  key: {
    usage: number;
    limit: number;
    search_usage: number;
    extract_usage: number;
    crawl_usage: number;
    map_usage: number;
    research_usage: number;
  };
  account: {
    current_plan: string;
    plan_usage: number;
    plan_limit: number;
    paygo_usage: number;
    paygo_limit: number;
    search_usage: number;
    extract_usage: number;
    crawl_usage: number;
    map_usage: number;
    research_usage: number;
  };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Low-level HTTP client for the Tavily Search API.
 */
export class TavilyClient {
  private readonly baseUrl = "https://api.tavily.com";
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(apiKey: string, timeout = 30_000) {
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    let lastError: TavilyError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log(`retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const msg =
            response.status === 401
              ? `Invalid Tavily API key. ${text}`
              : response.status === 429
                ? `Tavily API rate limit exceeded. You may have used your monthly quota. ${text}`
                : `Tavily API error (${response.status}): ${text}`;

          lastError = new TavilyError(msg, response.status);

          if (isRetryable(response.status) && attempt < MAX_RETRIES) {
            continue;
          }
          throw lastError;
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof TavilyError) {
          if (isRetryable(error.status) && attempt < MAX_RETRIES) {
            lastError = error;
            continue;
          }
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new TavilyError("Tavily API request timed out", 408);
        }
        throw new TavilyError(
          `Tavily API request failed: ${error instanceof Error ? error.message : String(error)}`,
          500,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  }

  async search(params: TavilySearchParams): Promise<TavilySearchResponse> {
    return this.request<TavilySearchResponse>("/search", params);
  }

  async extract(params: TavilyExtractParams): Promise<TavilyExtractResponse> {
    return this.request<TavilyExtractResponse>("/extract", params);
  }

  async getUsage(): Promise<TavilyUsageResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/usage`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new TavilyError(`Failed to fetch usage (${response.status}): ${text}`, response.status);
      }

      return (await response.json()) as TavilyUsageResponse;
    } catch (error) {
      if (error instanceof TavilyError) throw error;
      throw new TavilyError(`Failed to fetch usage: ${error instanceof Error ? error.message : String(error)}`, 500);
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Debug logger -- outputs to stderr when DICODE_DEBUG is set */
export function log(message: string): void {
  if (process.env.DICODE_DEBUG) {
    const ts = new Date().toISOString().slice(11, 19);
    process.stderr.write(`[dicode ${ts}] ${message}\n`);
  }
}
