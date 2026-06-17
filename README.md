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

### `web_read`

Extract clean content from web pages via the Tavily Extract API. Returns page text stripped of navigation, ads, and scripts. Supports up to 20 URLs per request.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `urls` | string[] | *required* | URLs to extract content from (1–20). Must be `http://` or `https://` |
| `extractDepth` | string | — | `"basic"` (1 credit per 5 URLs, raw page HTML as markdown including navigation/boilerplate) or `"advanced"` (2 credits per 5 URLs, clean article content with nav/ads/sidebar/footer stripped) |
| `includeImages` | boolean | `false` | Include extracted image URLs |

### `credit_balance`

Check your Tavily API credit balance and usage.

## GitHub Tools

Three tools for reading public GitHub repository content directly via the GitHub REST API. These do not go through the search provider — they live in their own namespace and work anonymously.

### `github_get_repo_structure`

List the directory structure of a GitHub repository path (single level, non-recursive). Useful for understanding project layout.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `repo` | string | *required* | Repository in the form `owner/repo` (e.g. `vitejs/vite`) |
| `path` | string | `/` | Directory path inside the repo |
| `ref` | string | default branch | Git ref (branch, tag, or commit SHA) |

### `github_read_file`

Read the full content of a file in a GitHub repository. Files larger than 512 KB or detected as binary are rejected.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `repo` | string | *required* | Repository in the form `owner/repo` |
| `path` | string | *required* | Path to the file inside the repo |
| `ref` | string | default branch | Git ref (branch, tag, or commit SHA) |

### `github_search_repo`

Search a GitHub repository across code, issues, and pull requests in one call. When `kind=all` (the default), all three searches run in parallel and results are grouped by type. Code search uses GitHub's `/search/code` endpoint, which **requires a `GITHUB_TOKEN`** (anonymous code search is not supported by GitHub — the call returns 401 without a token). Issues and PRs use `/search/issues` and work anonymously.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `repo` | string | *required* | Repository in the form `owner/repo` |
| `query` | string | *required* | Search query. GitHub search syntax is supported (e.g. `"auth token"`, `"bug in login"`, `"label:bug"`) |
| `kind` | string | `"all"` | `"code"`, `"issues"`, `"prs"`, or `"all"` (fans out across all three in parallel) |
| `state` | string | `"all"` | Filter for issues/PRs only (`"open"`, `"closed"`, or `"all"`). Ignored for code |
| `maxResults` | number | `5` | Max results per kind (1–10). When `kind=all`, the tool returns up to 3× this number of results |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TAVILY_API_KEY` | Yes\* | — | Your Tavily API key. Required when `WEBTOOLS_SEARCH_PROVIDER=tavily`. Get one at [tavily.com](https://tavily.com) |
| `GITHUB_TOKEN` | No | — | Optional GitHub token for the `github_*` tools. Lifts rate limits from 60 to 5000 requests/hour. Create one at [github.com/settings/tokens](https://github.com/settings/tokens) (no scopes needed for public repos) |
| `WEBTOOLS_SEARCH_PROVIDER` | No | `tavily` | Provider selection: `tavily` or `searxng` |
| `SEARXNG_URL` | Conditional | — | Base URL of a SearXNG instance. Required when `WEBTOOLS_SEARCH_PROVIDER=searxng` |
| `WEBTOOLS_MAX_RESULTS` | No | `5` | Default number of results (must be 1–20) |
| `WEBTOOLS_SEARCH_DEPTH` | No | `basic` | Default search depth |
| `WEBTOOLS_CACHE_TTL` | No | `3600` | Cache TTL in seconds (0 disables) |
| `WEBTOOLS_CACHE_MAX_ENTRIES` | No | `100` | Maximum cache entries before LRU eviction (0 disables caching) |
| `WEBTOOLS_CACHE_SWEEP_INTERVAL_MS` | No | `300000` | Interval in ms to sweep expired entries (0 disables periodic sweep) |
| `WEBTOOLS_DEBUG` | No | — | Set to any value to enable debug logging to stderr |

\* Required only when using the Tavily provider (the default).

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

## Security note

This server is designed for trusted AI clients (Claude Code, Claude Desktop, OpenCode). The `web_read` tool accepts any `http(s)://` URL supplied by the calling client and does not implement SSRF protections (e.g. blocking of private/internal IP ranges). Do not expose this server to untrusted input.

## License

MIT
