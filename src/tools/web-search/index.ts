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
  query: z.string().describe("The search query"),
  maxResults: z.number().min(1).max(20).optional().describe("Maximum number of results (default: 5)"),
  searchDepth: z
    .enum(["advanced", "basic", "fast", "ultra-fast"])
    .optional()
    .describe("Search depth: basic/fast/ultra-fast (1 credit) or advanced (2 credits)"),
  topic: z.enum(["general", "news", "finance"]).optional().describe("Search topic category"),
  timeRange: z.enum(["day", "week", "month", "year"]).optional().describe("Time range filter for results"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date filter (YYYY-MM-DD)"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date filter (YYYY-MM-DD)"),
  includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
  excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
  includeAnswer: z.boolean().optional().describe("Include an AI-generated answer (default: true)"),
};

export function registerWebSearchTool(server: McpServer, config: ServerConfig, provider: SearchProvider) {
  server.tool(
    "web_search",
    "Search the web using Tavily. Returns results with titles, URLs, and snippets. Supports filtering by domain, topic, time range, and search depth.",
    webSearchSchema,
    async (params) => {
      try {
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
