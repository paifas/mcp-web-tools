#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerWebSearchTool } from "./tools/web-search/index.js";
import { registerWebReaderTool } from "./tools/web-reader/index.js";
import { registerCreditBalanceTool } from "./tools/credit-balance/index.js";

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  registerWebSearchTool(server, config);
  registerWebReaderTool(server, config);
  registerCreditBalanceTool(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
