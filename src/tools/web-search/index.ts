import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import type { SearchProvider } from "../../providers/search-provider.js";
import { TavilyError } from "../../providers/tavily/tavily-search.js";
import { log } from "../../providers/tavily/client/index.js";
import { formatSearchResponse } from "../../utils/format/index.js";
import { cacheKey, cacheGet, cacheSet } from "../../utils/cache/index.js";
import type { SearchResponse } from "../../types.js";

const webSearchSchema = {
  query: z.string().trim().min(1).describe("A nonempty search query"),
  maxResults: z.number().int().min(1).max(20).optional(),
  searchDepth: z
    .enum(["advanced", "basic", "fast", "ultra-fast"])
    .optional()
    .describe("Tavily only: basic/fast/ultra-fast (1 credit) or advanced (2 credits). Ignored by SearXNG."),
  topic: z
    .enum(["general", "news", "finance"])
    .optional()
    .describe("Search category. SearXNG maps finance to general."),
  timeRange: z.enum(["day", "week", "month", "year"]).optional().describe("Time range filter for results"),
  startDate: z.iso.date().optional().describe("Tavily start date (YYYY-MM-DD). Ignored by SearXNG."),
  endDate: z.iso.date().optional().describe("Tavily end date (YYYY-MM-DD). Ignored by SearXNG."),
  includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
  excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
  includeAnswer: z.boolean().optional().describe("Tavily AI-generated answer (default: true). Ignored by SearXNG."),
};

export function registerWebSearchTool(server: McpServer, config: ServerConfig, provider: SearchProvider) {
  server.tool(
    "web_search",
    `Search the web using ${provider.name}. Returns titles, URLs, and snippets. ` +
      (provider.name === "searxng"
        ? "Domain filters are post-filtered and may return fewer results. Search depth, explicit start/end dates and AI answers are ignored; finance maps to general. Time filtering depends on the instance and engines."
        : "Supports domain, topic, date and depth filters. Optional answers are provider-generated, not source evidence."),
    {
      ...webSearchSchema,
      maxResults: webSearchSchema.maxResults.describe(`Maximum results (default: ${config.defaultMaxResults}, 1–20)`),
      searchDepth: webSearchSchema.searchDepth.describe(
        provider.name === "tavily"
          ? `Tavily depth (default: ${config.defaultSearchDepth}): basic/fast/ultra-fast cost 1 credit, advanced costs 2.`
          : "Ignored by SearXNG.",
      ),
    },
    async (params) => {
      try {
        if (params.startDate && params.endDate && params.startDate > params.endDate) {
          return {
            content: [{ type: "text" as const, text: "startDate must be on or before endDate." }],
            isError: true,
          };
        }
        const searchParams = {
          query: params.query,
          maxResults: params.maxResults ?? config.defaultMaxResults,
          searchDepth: params.searchDepth ?? config.defaultSearchDepth,
          topic: params.topic,
          timeRange: params.timeRange,
          startDate: params.startDate,
          endDate: params.endDate,
          includeDomains: params.includeDomains,
          excludeDomains: params.excludeDomains,
          includeAnswer: params.includeAnswer ?? true,
        };

        const key = cacheKey("search", searchParams);
        const cached = cacheGet<SearchResponse>(key);
        if (cached) {
          log("cache hit: search");
          const text = formatSearchResponse(cached);
          return { content: [{ type: "text" as const, text }] };
        }

        log(`cache miss: search "${params.query}"`);
        const response = await provider.search(searchParams);
        cacheSet(key, response, config.cacheTtl);

        const text = formatSearchResponse(response);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        if (error instanceof TavilyError) {
          return {
            content: [{ type: "text" as const, text: `Search error: ${error.message}` }],
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
