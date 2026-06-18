# mcp-web-tools

MCP server providing web search and content extraction tools for AI assistants. **Works out of the box with zero config** — no API keys, no Docker. Search and extract backends are decoupled and individually swappable between [SearXNG](https://searxng.org) (public or self-hosted), [Tavily](https://tavily.com) (hosted), and [Firecrawl](https://firecrawl.dev) (keyless or self-hosted).

## Install

No API keys, no Docker, no config files. Just add the server — it works out of the box using a public SearXNG instance for search and Firecrawl keyless for extraction.

**Claude Code (CLI):**

```bash
claude mcp add mcp-web-tools -- npx -y mcp-web-tools
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcp-web-tools": {
      "command": "npx",
      "args": ["-y", "mcp-web-tools"]
    }
  }
}
```

**OpenCode** — add to `~/.config/opencode/opencode.json` (global) or `.opencode.json` in your project root:

```jsonc
"mcp-web-tools": {
  "type": "local",
  "command": ["npx", "-y", "mcp-web-tools"]
}
```

That's it — search and extraction both work with zero configuration. The sections below cover customizing the backends.

## How it works

The server has two independent backends, each overridable via env vars in your client config:

- **Search** (`WEBTOOLS_SEARCH_PROVIDER`): defaults to `searxng` — uses a [public SearXNG instance](https://search.mdosch.de). Override with `tavily`, or point `SEARXNG_URL` at your own instance.
- **Extract** (`WEBTOOLS_EXTRACT_PROVIDER`): defaults to `firecrawl` keyless — no API key needed. Override with `tavily`, or set to `none` to disable `web_read`.

> ⚠️ The default public SearXNG instance is volunteer-operated. If it's down or rate-limited, set `SEARXNG_URL` to another instance or [run your own](#self-hosting-searxng-optional).

## Customizing backends

### Use a different SearXNG instance

Point `SEARXNG_URL` at any SearXNG instance — public, self-hosted, or team-shared:

```bash
claude mcp add mcp-web-tools -e SEARXNG_URL=https://your-instance.example -- npx -y mcp-web-tools
```

Find public instances at [searx.space](https://searx.space/).

### Use Tavily instead (single key, both tools)

```bash
claude mcp add mcp-web-tools -e WEBTOOLS_SEARCH_PROVIDER=tavily -e TAVILY_API_KEY=your-key -- npx -y mcp-web-tools
```

Get a key at [tavily.com](https://tavily.com). Extract automatically uses Tavily too (key reuse).

### Firecrawl options

The default Firecrawl keyless tier gives ~1000 extractions/month. For higher limits:

```bash
claude mcp add mcp-web-tools -e FIRECRAWL_API_KEY=fc-your-key -- npx -y mcp-web-tools
```

### Provider combinations

| Search | Extract | Env vars |
|---|---|---|
| SearXNG (default) | Firecrawl keyless (default) | *none* |
| SearXNG | Firecrawl keyed | `FIRECRAWL_API_KEY` |
| SearXNG | Tavily | `WEBTOOLS_EXTRACT_PROVIDER=tavily` + `TAVILY_API_KEY` |
| SearXNG | none (`web_read` disabled) | `WEBTOOLS_EXTRACT_PROVIDER=none` |
| Tavily | Tavily | `WEBTOOLS_SEARCH_PROVIDER=tavily` + `TAVILY_API_KEY` |

More `claude mcp add` one-liners:

```bash
# Point at your own SearXNG
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -- npx -y mcp-web-tools

# SearXNG search + Tavily extract
claude mcp add mcp-web-tools -e WEBTOOLS_EXTRACT_PROVIDER=tavily -e TAVILY_API_KEY=your-key -- npx -y mcp-web-tools

# Search only, web_read disabled
claude mcp add mcp-web-tools -e WEBTOOLS_EXTRACT_PROVIDER=none -- npx -y mcp-web-tools

# Firecrawl keyed (higher limits)
claude mcp add mcp-web-tools -e FIRECRAWL_API_KEY=fc-your-key -- npx -y mcp-web-tools
```

## Self-hosting SearXNG (optional)

For full control over availability and rate limits, run your own SearXNG instance and point `SEARXNG_URL` at it.

The key requirement: SearXNG must have **JSON output enabled**. The default Docker image only serves HTML, so you need a `settings.yml` with `json` in `search.formats`. See the official docs:

→ [SearXNG — Installation & Docker](https://docs.searxng.org/admin/installation-docker.html)
→ [SearXNG — settings.yml reference](https://docs.searxng.org/admin/settings/settings.html)

Minimal `settings.yml` (mount this into the container):

```yaml
use_default_settings: true
server:
  secret_key: "your-random-secret"
search:
  formats: [html, json]
```

Then point the server at it:

```bash
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -- npx -y mcp-web-tools
```

## Full self-host (optional)

Run everything with no external network calls: SearXNG for search, Firecrawl for extract, both on your machine.

**1. SearXNG** — see [Self-hosting SearXNG](#self-hosting-searxng-optional) above.

**2. Firecrawl** — use Firecrawl's official self-host guide. Their stack needs Postgres, RabbitMQ, Redis, and Playwright:

→ [firecrawl/firecrawl — SELF_HOST.md](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md)

**3. Point mcp-web-tools at both:**

```bash
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -e FIRECRAWL_URL=http://localhost:3002 -- npx -y mcp-web-tools
```

## Tools

### `web_search`

Search the web. Returns results with titles, URLs, and snippets. Backend is configured server-side (Tavily or SearXNG).

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

Extract clean content from web pages. Returns page text stripped of navigation, ads, and scripts. Supports up to 20 URLs per request. Backend is configured server-side (Tavily or Firecrawl). Not registered when `WEBTOOLS_EXTRACT_PROVIDER=none`.

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `urls` | string[] | *required* | URLs to extract content from (1–20). Must be `http://` or `https://` |
| `extractDepth` | string | — | `"basic"` (1 credit per 5 URLs, raw page HTML as markdown including navigation/boilerplate) or `"advanced"` (2 credits per 5 URLs, clean article content with nav/ads/sidebar/footer stripped) |
| `includeImages` | boolean | `false` | Include extracted image URLs |

### `credit_balance`

Check your provider credit balance and usage. Returns "not supported" when the active provider has no credit system (e.g. SearXNG).

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
| `WEBTOOLS_SEARCH_PROVIDER` | No | `searxng` | Search backend: `tavily` or `searxng` |
| `SEARXNG_URL` | No | `https://search.mdosch.de` | Base URL of a SearXNG instance. Defaults to a public instance; set to your own for reliability |
| `TAVILY_API_KEY` | Conditional | — | Tavily API key. Required when search or extract provider is `tavily`. Get one at [tavily.com](https://tavily.com) |
| `WEBTOOLS_EXTRACT_PROVIDER` | No | derived\* | Extract backend: `tavily`, `firecrawl`, or `none`. When unset: `tavily` if search is tavily, otherwise `firecrawl` |
| `FIRECRAWL_URL` | No | `https://api.firecrawl.dev` | Base URL of a Firecrawl instance. Accepts any HTTP(S) URL (local, hosted, or self-hosted) |
| `FIRECRAWL_API_KEY` | No | — | Optional. Omit for keyless mode (~1000 credits/month, IP-bucketed). Set for higher hosted limits. Ignored on self-hosted bypass mode |
| `GITHUB_TOKEN` | No | — | Optional GitHub token for the `github_*` tools. Lifts rate limits from 60 to 5000 requests/hour. Create one at [github.com/settings/tokens](https://github.com/settings/tokens) (no scopes needed for public repos) |
| `WEBTOOLS_MAX_RESULTS` | No | `5` | Default number of results (must be 1–20) |
| `WEBTOOLS_SEARCH_DEPTH` | No | `basic` | Default search depth |
| `WEBTOOLS_CACHE_TTL` | No | `3600` | Cache TTL in seconds (0 disables) |
| `WEBTOOLS_CACHE_MAX_ENTRIES` | No | `100` | Maximum cache entries before LRU eviction (0 disables caching) |
| `WEBTOOLS_CACHE_SWEEP_INTERVAL_MS` | No | `300000` | Interval in ms to sweep expired entries (0 disables periodic sweep) |
| `WEBTOOLS_DEBUG` | No | — | Set to any value to enable debug logging to stderr |

\* `WEBTOOLS_EXTRACT_PROVIDER` defaults to `tavily` when `WEBTOOLS_SEARCH_PROVIDER=tavily`, and to `firecrawl` otherwise.

## Provider limitations

Each backend supports a different subset of features. Unsupported params are silently ignored.

| Feature | Tavily | SearXNG | Firecrawl |
|---|---|---|---|
| `web_search` | ✅ | ✅ | — (extract only) |
| `web_read` / extract | ✅ | — (search only) | ✅ |
| AI answer (`includeAnswer`) | ✅ | ❌ ignored | — |
| Native domain filter | ✅ | post-filtered (may return fewer than `maxResults`) | — |
| `topic=finance` | ✅ | maps to `general` | — |
| `searchDepth` | ✅ | ❌ ignored | — |
| `extractDepth=advanced` | ✅ | — | ✅ (maps to `onlyMainContent`) |
| `includeImages` | ✅ | — | ❌ ignored |
| Credit/usage (`credit_balance`) | ✅ | ❌ "not supported" | ❌ "not supported" |

**Common pitfalls:**
- **SearXNG 403** — JSON output is disabled on the instance. Edit `settings.yml` (`search.formats` must include `json`) and restart. The `docker run` snippet in [Backends](#searxng-search-default) bakes this in via the mounted settings file.
- **SearXNG 429** — rate limiter is on. Disable `server.limiter` in `settings.yml`, or use a different instance.
- **Firecrawl 429** — keyless free tier exhausted (~1000 credits/month, 10/min). Set `FIRECRAWL_API_KEY` for higher limits, or self-host.

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
