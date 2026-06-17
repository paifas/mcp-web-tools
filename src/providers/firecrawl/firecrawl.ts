import type { ExtractProvider, ExtractParams } from "../extract-provider.js";
import type { ExtractResponse, ExtractResult } from "../../types.js";
import { chunk, sleep } from "../utils.js";

interface FirecrawlScrapeData {
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
  };
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: FirecrawlScrapeData;
  error?: string;
}

const MAX_RETRIES = 3;
const SCRAPE_TIMEOUT_MS = 30_000;

/**
 * Firecrawl extract provider.
 *
 * Three modes, all reached by env config rather than code branches:
 *  - keyless hosted (default): no Authorization header, IP-bucketed free tier
 *    (~1000 credits/month, 10/min).
 *  - keyed hosted: FIRECRAWL_API_KEY set, higher limits.
 *  - self-hosted: FIRECRAWL_URL pointed at a self-hosted instance; key ignored.
 *
 * Uses /v1/scrape in a bounded-concurrency loop rather than /v1/batch/scrape
 * (which is async/job-ID-based — wrong shape for a synchronous MCP tool call).
 */
export class FirecrawlProvider implements ExtractProvider {
  readonly name = "firecrawl";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async extract(params: ExtractParams): Promise<ExtractResponse> {
    const endpoint = `${this.baseUrl.replace(/\/$/, "")}/v1/scrape`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const batches = chunk(params.urls, 5);
    const results: ExtractResult[] = [];
    const failedResults: ExtractResponse["failedResults"] = [];

    // Run batches sequentially, URLs within a batch in parallel.
    for (const batch of batches) {
      const settled = await Promise.allSettled(batch.map((u) => this.scrapeOne(u, params, endpoint, headers)));
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          failedResults.push({ url: batch[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        }
      }
    }
    return { results, failedResults };
  }

  private async scrapeOne(
    url: string,
    params: ExtractParams,
    endpoint: string,
    headers: Record<string, string>,
  ): Promise<ExtractResult> {
    const body = {
      url,
      formats: ["markdown"],
      onlyMainContent: params.extractDepth === "advanced",
    };

    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });

      if (res.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfter = Number(retryAfterHeader);
          const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000;
          await sleep(waitMs);
          continue;
        }
        throw new Error(
          "Firecrawl rate limit (429) exhausted after retries. " +
            "You may be on the keyless free tier (1000 credits/month, 10/min). " +
            "Set FIRECRAWL_API_KEY for higher limits, or self-host Firecrawl.",
        );
      }

      if (!res.ok) {
        const errBody = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        lastError = `Firecrawl error (${res.status}): ${errBody ?? res.statusText}`;
        // Non-429 errors are not retryable.
        throw new Error(lastError);
      }

      const data = (await res.json()) as FirecrawlScrapeResponse;
      if (!data.success) {
        throw new Error(`Firecrawl scrape unsuccessful: ${JSON.stringify(data.data ?? {})}`);
      }
      return {
        url: data.data?.metadata?.sourceURL ?? url,
        content: data.data?.markdown ?? "",
      };
    }
    throw new Error(lastError || "Firecrawl scrape failed (unreachable)");
  }
}
