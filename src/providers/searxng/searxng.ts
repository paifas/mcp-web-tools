import type { SearchResponse, ExtractResponse } from "../../types.js";
import type { SearchProvider, SearchParams, ExtractParams } from "../search-provider.js";

/**
 * SearXNG provider — stub.
 *
 * Wiring is complete: the factory in `providers/registry.ts` will instantiate
 * this when `WEBTOOLS_SEARCH_PROVIDER=searxng`, and the server will boot. But
 * the actual HTTP implementation is intentionally unimplemented — every method
 * throws so callers fail loudly rather than receiving empty results.
 *
 * Replace the thrown errors with real `fetch` calls against `${baseUrl}/search`
 * (and `${baseUrl}/extract` if/when SearXNG exposes it) when implementing.
 */
export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";

  constructor(private readonly baseUrl: string) {}

  async search(_params: SearchParams): Promise<SearchResponse> {
    throw new Error(
      `SearXNG provider not yet implemented (baseUrl=${this.baseUrl}). ` +
        "Set WEBTOOLS_SEARCH_PROVIDER=tavily to use the Tavily provider.",
    );
  }

  async extract(_params: ExtractParams): Promise<ExtractResponse> {
    throw new Error(`SearXNG extract not yet implemented (baseUrl=${this.baseUrl}).`);
  }
}
