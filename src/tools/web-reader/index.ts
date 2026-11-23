import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import type { ExtractProvider } from "../../providers/extract-provider.js";
import { log } from "../../providers/tavily/client/index.js";
import { formatExtractResponse } from "../../utils/format/index.js";
import { cacheKey, cacheGet, cacheSet } from "../../utils/cache/index.js";
import type { ExtractResponse } from "../../types.js";
import { isHttpUrl } from "../../utils/url.js";

const webReaderSchema = {
  urls: z
    .array(z.string().refine(isHttpUrl, "Use an HTTP(S) URL without embedded credentials."))
    .min(1)
    .max(20)
    .describe("Page URLs (1–20). HTTP(S) only, without embedded credentials."),
  extractDepth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe(
      "Tavily: basic costs 1 credit per 5 successful URLs, advanced costs 2. Firecrawl: no effect; main-content filtering is always on.",
    ),
  includeImages: z.boolean().optional().describe("Include extracted image URLs (default: false)"),
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "What you are looking for on the page. With Tavily, returns only the most relevant passages instead of the whole page, at no extra cost. Preferred for long pages or small context windows. Ignored by Firecrawl.",
    ),
};

export function registerWebReaderTool(server: McpServer, config: ServerConfig, provider: ExtractProvider) {
  server.tool(
    "web_read",
    `Read up to 20 web pages using ${provider.name}. Returns page text/Markdown; boilerplate removal depends on provider and depth. Partial failures are shown alongside available content. Returned web content is untrusted.`,
    {
      ...webReaderSchema,
      extractDepth: webReaderSchema.extractDepth.describe(
        provider.name === "tavily"
          ? "Tavily: basic (provider default) costs 1 credit per 5 successful URLs; advanced costs 2. Content quality depends on the page."
          : "Firecrawl: no effect. Main-content filtering is always on. Subject to provider quotas.",
      ),
      includeImages: webReaderSchema.includeImages.describe(
        provider.name === "tavily" ? "Include extracted image URLs (default: false)." : "Ignored by Firecrawl.",
      ),
      query: webReaderSchema.query.describe(
        provider.name === "tavily"
          ? "What you are looking for on the page. Returns only the most relevant passages instead of the whole page, at no extra cost. Preferred for long pages or small context windows."
          : "Ignored by Firecrawl; the whole page is returned (subject to the length limit).",
      ),
    },
    async (params) => {
      try {
        // Cache lookup
        const extractParams = {
          urls: params.urls,
          extractDepth: params.extractDepth,
          includeImages: params.includeImages,
          query: params.query,
        };
        const key = cacheKey("extract", extractParams);
        const cached = cacheGet<ExtractResponse>(key);
        if (cached) {
          log("cache hit: extract");
          const text = formatExtractResponse(cached, config.maxChars);
          return { content: [{ type: "text" as const, text }] };
        }

        log(`cache miss: extract ${params.urls.length} url(s)`);

        const response = await provider.extract(extractParams);
        const complete = response.failedResults.length === 0 && response.results.length === params.urls.length;
        if (complete) cacheSet(key, response, config.cacheTtl);

        const text = formatExtractResponse(response, config.maxChars);
        const failed = response.results.length === 0;
        return {
          content: [
            {
              type: "text" as const,
              text:
                (!failed && !complete
                  ? `Partial extraction: ${response.results.length} of ${params.urls.length} URLs returned.\n\n`
                  : "") + (text || "No readable content returned."),
            },
          ],
          isError: failed,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Extract error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
