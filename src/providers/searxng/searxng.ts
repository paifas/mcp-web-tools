import type { SearchProvider, SearchParams } from "../search-provider.js";
import type { SearchResponse } from "../../types.js";
import { matchesDomain } from "../utils.js";

interface SearXNGResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface SearXNGResponse {
  results?: SearXNGResult[];
}

/**
 * SearXNG search provider — meta-search aggregator.
 *
 * No extract, no usage/credits. SearXNG must be configured with JSON output
 * enabled (search.formats includes "json" in settings.yml) and the limiter
 * disabled for automated callers.
 *
 * Limitations (documented in tool description + README):
 * - No native include/exclude domain filter — post-filtered by hostname, so
 *   fewer than maxResults may be returned.
 * - No AI answer field (includeAnswer is ignored).
 * - "finance" topic maps to "general".
 * - searchDepth is ignored.
 */
export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";

  constructor(private readonly baseUrl: string) {}

  async search(params: SearchParams): Promise<SearchResponse> {
    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("q", params.query);
    url.searchParams.set("format", "json");
    if (params.timeRange) url.searchParams.set("time_range", params.timeRange);
    url.searchParams.set("categories", params.topic === "news" ? "news" : "general");

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 403) {
      throw new Error(
        "SearXNG returned 403 — JSON output may be disabled. Edit settings.yml:\n\n" +
          "  search:\n    formats:\n      - html\n      - json\n\n" +
          "Then restart SearXNG. If you're using a public instance, the operator may have disabled JSON.",
      );
    }
    if (res.status === 429) {
      throw new Error(
        "SearXNG rate limit hit (429). Disable 'server.limiter' in settings.yml, or use a different instance.",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SearXNG error (${res.status}): ${body}`);
    }

    // SearXNG silently redirects to HTML (200) when JSON output is not enabled
    // instead of returning an error. Detect this and give an actionable message.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "SearXNG did not return JSON — JSON output is disabled. Edit settings.yml:\n\n" +
          "  search:\n    formats:\n      - html\n      - json\n\n" +
          "Then restart SearXNG. If you're using a public instance, the operator may have disabled JSON.",
      );
    }

    const data = (await res.json()) as SearXNGResponse;
    const max = params.maxResults ?? 5;
    // Oversample 3x so domain post-filtering still has a chance to fill max.
    let results = (data.results ?? []).slice(0, max * 3);

    if (params.includeDomains?.length) {
      results = results.filter((r) => r.url && matchesDomain(r.url, params.includeDomains!));
    }
    if (params.excludeDomains?.length) {
      results = results.filter((r) => !(r.url && matchesDomain(r.url, params.excludeDomains!)));
    }
    results = results.slice(0, max);

    return {
      query: params.query,
      results: results.map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
        score: typeof r.score === "number" ? r.score : undefined,
      })),
    };
  }
}
