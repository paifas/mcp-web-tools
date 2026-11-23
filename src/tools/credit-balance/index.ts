import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import type { SearchProvider } from "../../providers/search-provider.js";
import { TavilyError } from "../../providers/tavily/tavily-search.js";

export function registerCreditBalanceTool(server: McpServer, _config: ServerConfig, provider: SearchProvider) {
  server.tool(
    "credit_balance",
    "Check provider account-plan credit allowance and usage. The remaining plan allowance is not guaranteed " +
      "spendable API-key or pay-as-you-go capacity.",
    {},
    async () => {
      if (!provider.getUsage) {
        return {
          content: [
            {
              type: "text" as const,
              text: `credit_balance is not supported by the "${provider.name}" provider.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const usage = await provider.getUsage();
        const percentUsed = usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0;
        const breakdown = Object.entries(usage.breakdown)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const lines = [
          `Provider: ${usage.provider}` +
            (usage.plan ? ` — account plan: ${usage.plan}` : "") +
            ` — ${usage.used} / ${usage.limit} account-plan credits (${percentUsed}% used)`,
          `Account-plan remaining: ${usage.remaining}`,
          "Account-plan allowance is not guaranteed spendable API-key or pay-as-you-go capacity.",
          `Breakdown — ${breakdown}`,
        ];

        if (usage.remaining < 50) {
          lines.push("Account-plan allowance is running low. Check usage and limits in your provider's dashboard.");
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
    },
  );
}
