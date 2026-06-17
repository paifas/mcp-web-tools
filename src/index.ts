#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createProvider } from "./providers/registry.js";
import { cacheConfigure } from "./utils/cache/index.js";
import { registerWebSearchTool } from "./tools/web-search/index.js";
import { registerWebReaderTool } from "./tools/web-reader/index.js";
import { registerCreditBalanceTool } from "./tools/credit-balance/index.js";

async function main() {
  const config = loadConfig();
  cacheConfigure({
    maxEntries: config.cacheMaxEntries,
    sweepIntervalMs: config.cacheSweepIntervalMs,
  });
  const provider = createProvider(config);

  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  registerWebSearchTool(server, config, provider);
  registerWebReaderTool(server, config, provider);
  registerCreditBalanceTool(server, config, provider);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // The MCP SDK does not install signal handlers itself. Close the server and
  // transport cleanly on SIGINT/SIGTERM so in-flight requests are flushed and
  // the client observes a proper disconnect rather than a severed pipe.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await server.close();
      await transport.close();
    } catch (err) {
      console.error(`Error during ${signal} shutdown:`, err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
