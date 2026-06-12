import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import { TavilyClient, TavilyError } from "../../providers/tavily/client/index.js";

export function registerCreditBalanceTool(server: McpServer, config: ServerConfig) {
  const client = new TavilyClient(config.tavilyApiKey);

  server.tool("credit_balance", "Check your Tavily API credit balance.", {}, async () => {
    try {
      const usage = await client.getUsage();
      const remaining = usage.account.plan_limit - usage.account.plan_usage;
      const percentUsed =
        usage.account.plan_limit > 0 ? Math.round((usage.account.plan_usage / usage.account.plan_limit) * 100) : 0;
      const lines = [
        `Plan: ${usage.account.current_plan} — ${usage.account.plan_usage} / ${usage.account.plan_limit} credits (${percentUsed}% used)`,
        `Remaining: ${remaining}`,
        `Breakdown — search: ${usage.account.search_usage}, extract: ${usage.account.extract_usage}`,
      ];

      if (remaining < 50) {
        lines.push("Credits running low. Top up at https://tavily.com");
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (error) {
      if (error instanceof TavilyError) {
        return {
          content: [{ type: "text" as const, text: `Credit balance error: ${error.message}` }],
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
  });
}
