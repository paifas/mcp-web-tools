import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import { registerGetRepoStructureTool } from "./get-repo-structure/index.js";
import { registerReadFileTool } from "./read-file/index.js";

export function registerGithubTools(server: McpServer, config: ServerConfig) {
  registerGetRepoStructureTool(server, config);
  registerReadFileTool(server, config);
}
