import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ServerConfig } from "../src/config.js";

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    searchProvider: "searxng",
    searxngUrl: "http://localhost:8080",
    extractProvider: "firecrawl",
    firecrawlUrl: "http://localhost:3002",
    defaultMaxResults: 5,
    defaultSearchDepth: "basic",
    cacheTtl: 3600,
    cacheMaxEntries: 100,
    cacheSweepIntervalMs: 0,
    // 0 = no truncation, so existing assertions see the provider's full output.
    // The limit itself is tested explicitly in web-reader.test.ts.
    maxChars: 0,
    serverName: "test",
    serverVersion: "1.0.0",
    ...overrides,
  };
}

/** Exercises registration, generated schemas and SDK validation, not a copied handler. */
export async function openMcp(register: (server: McpServer) => void) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  register(server);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function toolText(response: Awaited<ReturnType<Client["callTool"]>>): string {
  return (response.content as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
