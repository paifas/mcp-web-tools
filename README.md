# mcp-web-tools

MCP server providing web search and content extraction tools for AI assistants. Search and extract backends are decoupled — pick any combination of [Tavily](https://tavily.com) (hosted), [SearXNG](https://searxng.org) (self-hostable meta-search), and [Firecrawl](https://firecrawl.dev) (hosted or self-hosted extraction). The zero-config default runs entirely without API keys (SearXNG search + Firecrawl keyless extract).

## Setup

Pick a stack below, then register the server with your client (examples at the end of this section).

### 1. Zero-cost stack (default)

The default uses **SearXNG for search** and **Firecrawl keyless for extract** — no API keys, no account. You only need to point at a SearXNG instance.

**Option A — local SearXNG container** (recommended; you control availability):

```bash
docker compose -f docker/docker-compose.yml up -d
export SEARXNG_URL=http://localhost:8080
```

**Option B — public SearXNG instance** (no Docker, but you depend on a third party):

```bash
export SEARXNG_URL=https://search.mdosch.de
```

> ⚠️ Public SearXNG instances are operated by volunteers and may be rate-limited, intermittently unavailable, or have JSON output disabled. A commonly available one is `https://search.mdosch.de`, but **this project does not control its availability**. For production use, run your own (Option A) or use Tavily.

With `SEARXNG_URL` set, no other env vars are required — Firecrawl keyless extract works with no key.

### 2. Tavily hosted (single key, both tools)

```bash
export TAVILY_API_KEY=your-api-key
export WEBTOOLS_SEARCH_PROVIDER=tavily
```

Extract automatically defaults to Tavily (key reuse).

### 3. Full self-host (SearXNG + Firecrawl local)

~14 GB RAM, multiple containers. Brings up Firecrawl's scrape stack (API + Playwright + Redis) behind a compose profile. Sufficient for `web_read`; for full Firecrawl parity (crawl queue, extraction history) see [Firecrawl's SELF_HOST.md](https://github.com/mendableai/firecrawl/blob/main/SELF_HOST.md).

```bash
docker compose -f docker/docker-compose.yml --profile full up -d
export SEARXNG_URL=http://localhost:8080
export FIRECRAWL_URL=http://localhost:3002
```

### 4. Remote / mixed instances

Any HTTP(S) URL works for either provider — point at a team-shared server, a cloud VM, or any public instance:

```bash
export WEBTOOLS_SEARCH_PROVIDER=searxng
export SEARXNG_URL=https://search.your-corp.internal
export FIRECRAWL_URL=https://firecrawl.your-corp.internal:3002
```

### Provider matrix

| Search | Extract | What you set |
|---|---|---|
| SearXNG (default) | Firecrawl keyless (default) | `SEARXNG_URL` only |
| SearXNG | Firecrawl keyed | `SEARXNG_URL` + `FIRECRAWL_API_KEY` |
| SearXNG | Tavily | `SEARXNG_URL` + `TAVILY_API_KEY` + `WEBTOOLS_EXTRACT_PROVIDER=tavily` |
| SearXNG | none (`web_read` disabled) | `SEARXNG_URL` + `WEBTOOLS_EXTRACT_PROVIDER=none` |
| Tavily | Tavily | `TAVILY_API_KEY` + `WEBTOOLS_SEARCH_PROVIDER=tavily` |

### Register with your client

**Claude Code (CLI):** pass `-e KEY=VALUE` flags for each env var. A few common combinations:

```bash
# Zero-cost stack (default) — local SearXNG + Firecrawl keyless
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -- npx -y mcp-web-tools

# Public SearXNG instance, no Docker
claude mcp add mcp-web-tools -e SEARXNG_URL=https://search.mdosch.de -- npx -y mcp-web-tools

# Fully self-hosted (SearXNG + Firecrawl local via docker compose --profile full)
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -e FIRECRAWL_URL=http://localhost:3002 -- npx -y mcp-web-tools

# SearXNG search + Tavily extract (reuse a Tavily key)
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -e WEBTOOLS_EXTRACT_PROVIDER=tavily -e TAVILY_API_KEY=your-tavily-key -- npx -y mcp-web-tools

# SearXNG search only, web_read disabled
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -e WEBTOOLS_EXTRACT_PROVIDER=none -- npx -y mcp-web-tools

# Firecrawl keyed (higher limits on hosted)
claude mcp add mcp-web-tools -e SEARXNG_URL=http://localhost:8080 -e FIRECRAWL_API_KEY=fc-your-key -- npx -y mcp-web-tools

# Tavily for both (single key, the original path)
claude mcp add mcp-web-tools -e WEBTOOLS_SEARCH_PROVIDER=tavily -e TAVILY_API_KEY=your-tavily-key -- npx -y mcp-web-tools
```

Tip: `claude mcp add` also accepts `-s user` to install at user scope (available in all projects) or `-s project` for a shared `.mcp.json`.

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcp-web-tools": {
      "command": "npx",
      "args": ["-y", "mcp-web-tools"],
      "env": {
        "SEARXNG_URL": "http://localhost:8080"
      }
    }
  }
}
```

**OpenCode** — add to `~/.config/opencode/opencode.json` (global) or `.opencode.json` in your project root:

```jsonc
"mcp-web-tools": {
  "type": "local",
  "command": ["npx", "-y", "mcp-web-tools"],
  "environment": {
    "SEARXNG_URL": "http://localhost:8080"
  }
}
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
| `SEARXNG_URL` | Conditional | — | Base URL of a SearXNG instance (e.g. `http://localhost:8080`, `https://search.mdosch.de`). Required when search provider is `searxng` |
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
- **SearXNG 403** — JSON output is disabled on the instance. Edit `settings.yml` (`search.formats` must include `json`) and restart. The included `docker/searxng-settings.yml` has this enabled.
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
