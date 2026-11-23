import type { SearchResponse, ExtractResponse } from "../../types.js";

/**
 * Formats a SearchResponse into a markdown string suitable for MCP tool output.
 */
export function formatSearchResponse(response: SearchResponse): string {
  const parts: string[] = [];

  if (response.answer) {
    parts.push(response.answer);
    parts.push("");
  }

  for (let i = 0; i < response.results.length; i++) {
    const result = response.results[i];
    parts.push(`### ${i + 1}. [${result.title}](${result.url})`);
    parts.push(`> ${result.snippet}`);
    parts.push("");
  }

  if (response.responseTime != null) {
    parts.push(`*Response time: ${response.responseTime}ms*`);
    parts.push("");
  }

  parts.push("---");
  parts.push("");
  parts.push("Sources:");
  for (const result of response.results) {
    parts.push(`- [${result.title}](${result.url})`);
  }

  return parts.join("\n");
}

/**
 * Truncate one page's content to `maxChars`, cutting at the last paragraph break
 * before the limit when there is one. Appends a notice so the model knows content
 * is missing, unlike client-side truncation. `maxChars` of 0 disables truncation.
 */
export function truncateContent(content: string, maxChars: number): string {
  if (maxChars <= 0 || content.length <= maxChars) return content;
  const window = content.slice(0, maxChars);
  const paragraphBreak = window.lastIndexOf("\n\n");
  // Use the paragraph break only if it leaves a reasonably sized prefix; otherwise
  // a single huge paragraph would collapse to almost nothing.
  const cut = paragraphBreak >= Math.floor(maxChars * 0.5) ? paragraphBreak : maxChars;
  const kept = content.slice(0, cut).replace(/\s+$/, "");
  return `${kept}\n\n[truncated: showing ${kept.length} of ${content.length} characters]`;
}

/**
 * Formats an ExtractResponse into a markdown string suitable for MCP tool output.
 * `maxChars` limits each page's content (0 disables).
 */
export function formatExtractResponse(response: ExtractResponse, maxChars = 0): string {
  const parts: string[] = [];

  for (const result of response.results) {
    parts.push(`## ${result.url}`);
    parts.push("");
    parts.push(truncateContent(result.content, maxChars));
    parts.push("");
    if (result.images?.length) {
      parts.push("### Images");
      for (const image of result.images) {
        parts.push(`- ${image}`);
      }
      parts.push("");
    }
  }

  if (response.failedResults.length > 0) {
    parts.push("---");
    parts.push("");
    parts.push("Failed:");
    for (const failed of response.failedResults) {
      parts.push(`- ${failed.url}: ${failed.error}`);
    }
    parts.push("");
  }

  if (response.responseTime != null) {
    parts.push(`*Response time: ${response.responseTime}ms*`);
    parts.push("");
  }

  return parts.join("\n");
}
