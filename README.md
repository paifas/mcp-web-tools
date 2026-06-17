# mcp-web-tools

MCP server providing web search tools for AI assistants, powered by [Tavily](https://tavily.com).

## Setup

You need a [Tavily API key](https://tavily.com) (free tier available).

### Claude Code (CLI)

```bash
claude mcp add mcp-web-tools -e TAVILY_API_KEY=your-api-key -- npx -y mcp-web-tools
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcp-web-tools": {
      "command": "npx",
      "args": ["-y", "mcp-web-tools"],
      "env": {
        "TAVILY_API_KEY": "your-api-key"
      }
    }
  }
}
```

### OpenCode

Add to `~/.config/opencode/opencode.json` (global) or `.opencode.json` in your project root:

```jsonc
"mcp-web-tools": {
  "type": "local",
  "command": ["npx", "-y", "mcp-web-tools"],
  "environment": {
    "TAVILY_API_KEY": "your-api-key"
  }
}
```

## Tools

### `web_search`

Search the web using Tavily. Returns results with titles, URLs, and snippets.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | *required* | The search query |
| `maxResults` | number | 5 | Maximum number of results (1–20) |
| `searchDepth` | string | `"basic"` | `"basic"`, `"fast"`, `"ultra-fast"` (1 credit) or `"advanced"` (2 credits) |
| `topic` | string | `"general"` | `"general"`, `"news"`, or `"finance"` |
| `timeRange` | string | — | `"day"`, `"week"`, `"month"`, or `"year"` |
| `startDate` | string | — | Start date filter (`YYYY-MM-DD`) |
| `endDate` | string | — | End date filter (`YYYY-MM-DD`) |
| `includeDomains` | string[] | — | Only include results from these domains |
| `excludeDomains` | string[] | — | Exclude results from these domains |
| `includeAnswer` | boolean | `true` | Include an AI-generated answer summary |

### `credit_balance`

Check your Tavily API credit balance and usage.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TAVILY_API_KEY` | Yes | — | Your Tavily API key. Get one at [tavily.com](https://tavily.com) |
| `WEBTOOLS_MAX_RESULTS` | No | `5` | Default number of results |
| `WEBTOOLS_SEARCH_DEPTH` | No | `basic` | Default search depth |
| `WEBTOOLS_CACHE_TTL` | No | `3600` | Cache TTL in seconds (0 to disable) |
| `WEBTOOLS_DEBUG` | No | — | Set to any value to enable debug logging to stderr |

## Example Output

```
Node.js 22 introduces require() support for ES modules, a WebSocket client, and updates to the V8 JavaScript engine.

### 1. [Node.js — Node.js 22 is now available!](https://nodejs.org/blog/announcements/v22-release-announce)
> We're excited to announce the release of Node.js 22! Highlights include require()ing ES modules, a WebSocket client, updates of the V8 JavaScript engine, and more!

*Response time: 1.2s*

---

Sources:
- [Node.js — Node.js 22 is now available!](https://nodejs.org/blog/announcements/v22-release-announce)
```

## License

MIT
