# Configuration

[README](../README.md) · [Clients](clients.md) · [Tool reference](tools.md)

Configure the environment of the MCP server process in your client. The server
reads configuration at startup; reconnect the MCP process after changing it.
There is no automatic `.env` loader. OpenCode V2 watches its configuration and
reloads MCP servers when you save it.

## Environment variables

| Variable | Default | Contract |
| --- | --- | --- |
| `WEBTOOLS_SEARCH_PROVIDER` | `searxng` | `searxng` or `tavily` |
| `WEBTOOLS_EXTRACT_PROVIDER` | Derived | `tavily`, `firecrawl`, or `none`. When unset, Tavily search selects Tavily reading; SearXNG search selects Firecrawl reading |
| `TAVILY_API_KEY` | Unset | Required if either selected provider is Tavily; the same key serves both |
| `SEARXNG_URL` | `https://search.mdosch.de` | SearXNG base URL; instance must support JSON search |
| `FIRECRAWL_URL` | `https://api.firecrawl.dev` | Firecrawl base URL, without `/v2/scrape`; deployment must support v2 |
| `FIRECRAWL_API_KEY` | Unset | Optional bearer token. When set, it is sent to the configured Firecrawl endpoint, including a custom endpoint |
| `GITHUB_TOKEN` | Unset | Optional for public directory/file/issue/PR access; required for code search. Token permissions can also allow private repository access |
| `WEBTOOLS_MAX_RESULTS` | `5` | Default `web_search.maxResults`; integer from 1 through 20 |
| `WEBTOOLS_SEARCH_DEPTH` | `basic` | Default `web_search.searchDepth`: `basic`, `fast`, `ultra-fast`, or `advanced` |
| `WEBTOOLS_CACHE_TTL` | `3600` | Seconds; `0` disables caching |
| `WEBTOOLS_CACHE_MAX_ENTRIES` | `100` | Shared search/read cache entry limit; `0` disables caching |
| `WEBTOOLS_CACHE_SWEEP_INTERVAL_MS` | `300000` | Milliseconds between expired-entry sweeps; `0` disables only the periodic sweep |
| `WEBTOOLS_MAX_CHARS` | `20000` | Maximum characters of each page returned by `web_read`, cut at a paragraph boundary with a notice; `0` disables |
| `WEBTOOLS_DEBUG` | Unset | Any nonempty value enables debug logs on stderr, including `"0"` or `"false"`; unset or empty disables |

Numeric settings must be whole, nonnegative safe-integer strings, with the
additional 1–20 bound on `WEBTOOLS_MAX_RESULTS`. Values such as `60seconds`,
`1.5`, `-1`, and integers outside JavaScript's safe range are rejected.
The sweep interval cannot exceed Node's timer limit of `2147483647` milliseconds;
the TTL must also fit a safe expiration timestamp after conversion to milliseconds.
Provider names and the search-depth enum are validated at startup.

Active provider base URLs must be valid HTTP(S) URLs without embedded username
or password. HTTP localhost endpoints are supported. These checks validate
configuration, not network trust: see [Security](../SECURITY.md).

### Endpoint paths

- **SearXNG:** requests go to `/search` at the configured origin. A reverse-proxy
  prefix such as `https://example.com/searx/` is not preserved. Expose it at an
  origin's root or use a dedicated hostname.
- **Firecrawl:** `/v2/scrape` is appended to the base URL. Use
  `http://localhost:3002`, not `http://localhost:3002/v2`.
- **Tavily and GitHub:** use their fixed public API endpoints; this package does
  not expose environment settings for alternate endpoints.

## Provider combinations

The following are **illustrative environment settings**, not live availability checks.
Use them in the `env` or `environment` object appropriate to your [client](clients.md).

| Search | Reading | Settings |
| --- | --- | --- |
| Public SearXNG | Keyless Firecrawl Cloud | None; best-effort runtime defaults |
| Tavily | Tavily | `WEBTOOLS_SEARCH_PROVIDER=tavily`, `TAVILY_API_KEY=…` |
| SearXNG | Tavily | `WEBTOOLS_EXTRACT_PROVIDER=tavily`, `TAVILY_API_KEY=…` |
| Tavily | Firecrawl | `WEBTOOLS_SEARCH_PROVIDER=tavily`, `TAVILY_API_KEY=…`, `WEBTOOLS_EXTRACT_PROVIDER=firecrawl` |
| SearXNG | Keyed Firecrawl Cloud | `FIRECRAWL_API_KEY=…` |
| Your SearXNG | Your Firecrawl | `SEARXNG_URL=http://localhost:8080`, `FIRECRAWL_URL=http://localhost:3002` |
| Either | Disabled | `WEBTOOLS_EXTRACT_PROVIDER=none`, plus any settings needed by search |

The self-hosted row assumes the default search selection. If your client already
sets Tavily, explicitly set `WEBTOOLS_SEARCH_PROVIDER=searxng` and
`WEBTOOLS_EXTRACT_PROVIDER=firecrawl`. A provider failure never switches providers.

## Cache behavior

Search and read results share a process-local LRU/TTL cache. It is not persistent
or shared between clients/processes. The default TTL is one hour and the default
capacity is 100 entries, not 100 URLs or a byte limit.

- Successful searches are cached.
- Only complete successful read responses are cached. Total and partial read
  failures are not cached.
- A read cache entry covers the whole request, including URL order and options
  (including `query`); there is no per-URL cache.
- The cache stores the provider's full response. `WEBTOOLS_MAX_CHARS` is applied
  when the result is returned, so changing it does not require a new fetch.
- Retrying a partial batch can repeat successful work and consume more provider
  allowance. Resubmit only the failed URLs when possible.
- Cached results retain their original provider-reported timing; it is not a
  measurement of cache-hit latency.
- Expiry is still checked on reads when periodic sweeping is disabled.
- GitHub tools and `credit_balance` do not use this cache.

For fresh results, disable caching in the server environment and reconnect.
Restarting the MCP process clears its in-memory cache. There is no cache-clear tool.

## Allowance and cost

Tavily's [credits policy](https://docs.tavily.com/documentation/api-credits),
checked 2026-11-20, offers 1,000 recurring monthly credits without a credit card.
Search and extract draw from the same allowance. Basic/fast/ultra-fast search
cost 1 credit; advanced search costs 2. Basic extract costs 1 credit per 5
successful URLs; advanced extract costs 2. Consult the provider for current
account, key, and pay-as-you-go limits.

Firecrawl Cloud [keyless usage](https://docs.firecrawl.dev/rate-limits#keyless-no-api-key)
is subject to daily per-IP request and credit caps. Account offers and keyless
limits are different; this project does not promise a monthly keyless allowance.
`credit_balance` does not report Firecrawl usage.

The package does not enforce a spending limit. Keep basic depths, select URLs
before reading, and set account-side limits to suit your budget. Model inference
and self-hosting infrastructure costs are separate.
