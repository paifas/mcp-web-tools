import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import type { SearchProvider } from "../../providers/search-provider.js";
import { TavilyError } from "../../providers/tavily/tavily-search.js";
import { log } from "../../providers/tavily/client/index.js";
import { formatExtractResponse } from "../../utils/format/index.js";
import { cacheKey, cacheGet, cacheSet } from "../../utils/cache/index.js";
import type { ExtractResponse } from "../../types.js";

const webReaderSchema = {
  urls: z.array(z.string()).min(1).max(20).describe("URLs to extract content from (1-20)"),
  extractDepth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe(
      "Extraction depth: basic (1 credit per 5 URLs, returns raw page HTML as markdown including navigation and boilerplate) or advanced (2 credits per 5 URLs, extracts clean article content with navigation/ads/sidebar/footer stripped)",
    ),
  includeImages: z.boolean().optional().describe("Include extracted image URLs (default: false)"),
};

export function registerWebReaderTool(server: McpServer, config: ServerConfig, provider: SearchProvider) {
  server.tool(
    "web_read",
    "Extract clean content from web pages. Returns page text stripped of navigation, ads, and scripts. Supports up to 20 URLs per request.",
    webReaderSchema,
    async (params) => {
      try {
        // URL validation
        for (const url of params.urls) {
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return {
              content: [{ type: "text" as const, text: `Invalid URL: "${url}". Must start with http:// or https://.` }],
              isError: true,
            };
          }
          try {
            new URL(url);
          } catch {
            return {
              content: [{ type: "text" as const, text: `Invalid URL format: "${url}".` }],
              isError: true,
            };
          }
        }

        // Cache lookup
        const extractParams = {
          urls: params.urls,
          extractDepth: params.extractDepth,
          includeImages: params.includeImages,
        };
        const key = cacheKey("extract", extractParams);
        const cached = cacheGet<ExtractResponse>(key);
        if (cached) {
          log("cache hit: extract");
          const text = formatExtractResponse(cached);
          return { content: [{ type: "text" as const, text }] };
        }

        log(`cache miss: extract ${params.urls.length} url(s)`);

        // Non-null assertion fix
        if (!provider.extract) {
          return {
            content: [{ type: "text" as const, text: "Extract not supported by current provider." }],
            isError: true,
          };
        }
        const response = await provider.extract(extractParams);
        cacheSet(key, response, config.cacheTtl);

        const text = formatExtractResponse(response);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        if (error instanceof TavilyError) {
          return {
            content: [{ type: "text" as const, text: `Extract error: ${error.message}` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
