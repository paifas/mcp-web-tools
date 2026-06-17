import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../../config.js";
import { GithubClient, GithubError } from "../client.js";

const readFileSchema = {
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, "Must be in the form 'owner/repo' (e.g. 'vitejs/vite')")
    .describe("GitHub repository in the form 'owner/repo'"),
  path: z.string().min(1).describe("Path to the file inside the repo (forward slashes)."),
  ref: z
    .string()
    .optional()
    .describe("Git ref (branch name, tag, or commit SHA). Defaults to the repo's default branch."),
};

// Files above this size are returned as an error pointing the user elsewhere.
// GitHub serves files up to 1 MB via the contents API, but content that large
// is rarely useful to push through an LLM context window.
const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

function decodeBase64(b64: string): string {
  // GitHub returns standard base64 (may include newlines every 76 chars).
  const clean = b64.replace(/\s/g, "");
  // Node's Buffer handles base64 decoding even when the input is UTF-8 safe.
  return Buffer.from(clean, "base64").toString("utf-8");
}

function looksBinary(text: string): boolean {
  // Heuristic: if the decoded content contains NUL bytes or a high ratio of
  // non-printable/non-UTF8 bytes, treat as binary.
  if (text.includes("\u0000")) return true;
  let nonPrintable = 0;
  const sample = text.slice(0, 4096);
  for (const ch of sample) {
    const code = ch.codePointAt(0)!;
    if (code < 0x09 || (code > 0x0d && code < 0x20)) {
      nonPrintable++;
    }
  }
  return sample.length > 0 && nonPrintable / sample.length > 0.1;
}

export function registerReadFileTool(server: McpServer, config: ServerConfig) {
  const client = new GithubClient(config.githubToken);

  server.tool(
    "github_read_file",
    "Read the full content of a file in a GitHub repository. " +
      "Returns the decoded text. Files larger than 512 KB or detected as binary are rejected. " +
      "Works without a token (anonymous rate limits apply — set GITHUB_TOKEN for higher limits).",
    readFileSchema,
    async (params) => {
      try {
        const [owner, repo] = params.repo.split("/");
        const result = await client.readFile(owner, repo, params.path, params.ref);

        if (result.encoding === "none" || result.size === 0) {
          return {
            content: [{ type: "text" as const, text: `(empty file: ${params.repo}/${params.path})` }],
          };
        }

        if (result.size > MAX_FILE_SIZE_BYTES) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File ${params.repo}/${params.path} is ${formatBytes(result.size)}, which exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit. Use a raw.githubusercontent.com URL or clone the repo.`,
              },
            ],
            isError: true,
          };
        }

        const decoded = decodeBase64(result.content);
        if (looksBinary(decoded)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File ${params.repo}/${params.path} appears to be binary. Content extraction is not supported.`,
              },
            ],
            isError: true,
          };
        }

        const header = `## ${params.repo}/${params.path}${params.ref ? ` @ ${params.ref}` : ""} (${formatBytes(result.size)})`;
        return {
          content: [{ type: "text" as const, text: `${header}\n\n\`\`\`\n${decoded}\n\`\`\`` }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof GithubError ? error.message : `Unexpected error: ${String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
