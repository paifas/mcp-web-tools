# Tool reference

[README](../README.md) · [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)

The six tool names below are unchanged. Results are MCP text content, generally
Markdown, with `isError: true` for tool failures. A successful HTTP response from
a provider does not necessarily mean every requested item succeeded.
`web_read` limits each page to `WEBTOOLS_MAX_CHARS` characters (default 20,000).

All examples in this guide are **illustrative inputs**, not live-verified results.

## `web_search`

Search with the configured Tavily or SearXNG provider. Returns numbered titles,
URLs, snippets, and a Sources list. Tavily can also return an AI-generated answer.

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `query` | string | Required | Trimmed, nonempty query |
| `maxResults` | integer | `WEBTOOLS_MAX_RESULTS` (`5`) | 1–20; providers/filtering may return fewer |
| `searchDepth` | enum | `WEBTOOLS_SEARCH_DEPTH` (`basic`) | `basic`, `fast`, `ultra-fast`, `advanced`; Tavily only |
| `topic` | enum | `general` | `general`, `news`, `finance`; SearXNG maps finance to general |
| `timeRange` | enum | Unset | `day`, `week`, `month`, `year`; provider/engine support varies |
| `startDate` | string | Unset | Real calendar date, `YYYY-MM-DD`; Tavily only |
| `endDate` | string | Unset | Real calendar date, `YYYY-MM-DD`; Tavily only |
| `includeDomains` | string[] | Unset | Domains to include, such as `["example.com"]` |
| `excludeDomains` | string[] | Unset | Domains to exclude |
| `includeAnswer` | boolean | `true` | Request a Tavily-generated answer; ignored by SearXNG |

When both dates are set, `startDate` must be on or before `endDate`. Calendar
validation still applies when SearXNG is selected, even though it ignores dates.
Tavily's published domain limits are 300 included and 150 excluded domains;
provider restrictions apply in addition to the MCP schema.

```json
{
  "query": "example release notes",
  "maxResults": 3,
  "searchDepth": "basic",
  "includeDomains": ["example.com"],
  "includeAnswer": false
}
```

Tavily's API reports time in seconds; the adapter converts it to milliseconds
before rendering `Response time: …ms`. This is provider-reported time, not total
client latency, and a cached response retains the original value.

## `web_read`

Read selected URLs with Tavily Extract or Firecrawl Scrape. Not registered when
`WEBTOOLS_EXTRACT_PROVIDER=none`.

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `urls` | string[] | Required | 1–20 syntactically valid HTTP(S) URLs, without embedded credentials |
| `extractDepth` | enum | Unset | `basic` or `advanced`; Tavily only (see below) |
| `includeImages` | boolean | `false` | Tavily image URLs, grouped under their source pages; ignored by Firecrawl |
| `query` | string | Unset | What to find on the page. Tavily returns only the most relevant passages; ignored by Firecrawl |

```json
{
  "urls": ["https://example.com/article"],
  "query": "refund policy for annual plans"
}
```

### Use `query` for long pages

Without `query`, `web_read` returns the whole page. With it, Tavily picks the
passages most relevant to the query and returns those instead, for the **same
credit cost**. On one documentation page, measured on 2026-11-23:

| | Returned | Rough size |
| --- | --- | --- |
| No `query` | whole page | 71,433 characters (~18k tokens) |
| `query` | 3 passages | 2,149 characters (~540 tokens) |

Passages are joined by `[...]`. Tavily chooses them by relevance, so the fact you
need may not be among them; call again without `query` if it is missing.

Prefer `query` when the client has no file tools (chat UIs such as LM Studio or
Open WebUI) or the model has a small context window. In a coding agent, a long
page can also be saved to disk and searched, so `query` is a cost optimization
rather than a necessity.

### Extraction differences

**Tavily:** omitted depth uses the provider's basic default. Advanced extraction
can retrieve more data, including tables and embedded content, with different
latency and credit cost. There is no guarantee that navigation, advertisements,
or every unwanted element will be removed. Requested image URLs returned by
Tavily appear under their page's text; the server does not download image bytes.
Provider response time is converted from seconds to milliseconds.

**Firecrawl:** sends `POST /v2/scrape` with `formats: ["markdown"]` and
**`onlyMainContent: true`**, a deterministic HTML filter that removes navigation,
headers and footers. It involves no LLM and costs nothing extra. `extractDepth`
has no effect on Firecrawl, and `query` is ignored because Firecrawl has no
passage-ranking option: the whole page is returned, subject to the length limit.
This is not a request for LLM-based structured extraction. `includeImages` is
ignored as a separate option, although returned Markdown may already contain
image references.

### Length limit

Each page's content is cut to **`WEBTOOLS_MAX_CHARS` characters** (default
`20,000`, about 5,000 tokens; `0` disables). The cut falls at the last paragraph
break before the limit when there is one, and a notice is appended:

```
[truncated: showing 20000 of 71433 characters]
```

The notice tells the model that content is missing. Some clients also truncate
large tool results, but silently and to a preview of their own choosing; this
limit is applied first, so what the model sees ends with an honest marker. The
cache stores the full response, so changing the setting takes effect without
fetching again. The limit counts characters, not tokens, and applies per page.

Firecrawl requests run in sequential batches of up to five concurrent URLs.
The adapter requires a successful envelope containing a Markdown string; missing
Markdown is a failure, while an explicitly empty string is a valid successful
extraction.

### Failure and cache contract

- **No successful URLs:** `isError: true`, with failure information.
- **Mixed successes and failures:** returns successful pages plus a `Failed:`
  section; the whole call is not marked as a total failure.
- **Complete success:** normal text response, eligible for caching.
- Neither total failures nor partial responses enter the successful-response
  cache. Retrying can therefore recover, but repeating a batch can also repeat
  successful provider work and consume allowance.

### Firecrawl retry bounds

For HTTP 429, Firecrawl gets at most **3 attempts per URL**, with at most
**15 seconds of total retry waiting per URL**. `Retry-After` accepts nonnegative
seconds or an HTTP date; missing or invalid values use a 5-second wait.
If a valid requested delay exceeds the remaining wait budget, the URL fails
instead of retrying early. Each fetch attempt has a **30-second timeout**.
Other HTTP failures are not automatically retried by this adapter.

The retry-wait budget is not a 15-second end-to-end deadline. Multiple URL
batches, fetches, and response processing add time. MCP cancellation is not
propagated to upstream requests, and there is no total multi-URL operation deadline.
These Firecrawl bounds do not describe other providers' retry policies.

## `credit_balance`

No parameters. Uses the **search provider**, not the extraction provider.

- With Tavily search, reports the account plan, plan usage/limit/remainder, and
  operation breakdown returned by Tavily.
- With SearXNG search, returns an unsupported-operation error, even if reading
  uses Tavily.

The remainder is **account-plan allowance**, not a guarantee of capacity for the
calling key. Key limits, rate limits, and pay-as-you-go usage/limits can differ.
Use the Tavily dashboard for billing decisions. A usage breakdown can mention
other Tavily operations used by the account; those are not additional tools in
this package.

## GitHub tools

These call `api.github.com` directly, independently of the web providers.
Public directory/file reads and issue/PR searches can work without a token;
**code search requires `GITHUB_TOKEN`**. A token can allow private repository
content into the MCP client and model context. Use only the permissions and
repositories you intend to expose.

GitHub's typical primary REST allowance is 60 requests/hour without
authentication or 5,000/hour with a personal token. Search endpoints have
tighter limits, and secondary limits also apply; a token does not guarantee
5,000 searches/hour. See [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
and [code-search requirements](https://docs.github.com/en/rest/search/search#search-code).

### `github_get_repo_structure`

Lists one directory level, directories first, then files alphabetically. It is
not a recursive repository tree.

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `repo` | string | Required | `owner/repo`, not a repository URL |
| `path` | string | `/` | Directory path with forward slashes |
| `ref` | string | Default branch | Branch, tag, or commit SHA |

A file path returns an error directing you to `github_read_file`.

### `github_read_file`

Reads decoded text from one repository file.

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `repo` | string | Required | `owner/repo` |
| `path` | string | Required | Nonempty file path with forward slashes |
| `ref` | string | Default branch | Branch, tag, or commit SHA |

Files over **512 KiB (524,288 bytes)**, nonempty files with unsupported inline
encodings, and heuristically detected binary content return errors. Missing
inline content on a nonempty file is not reported as an empty file. A zero-byte
file is valid.
Directory and file paths are encoded by segment for the GitHub API, so literal
`#`, `?`, and spaces in filenames remain part of the path. Supply actual path
text rather than URL-encoded text; traversal segments (`.` and `..`) are rejected.
The `/` repository-root convention remains supported by the directory tool.

### `github_search_repo`

Searches the requested repository sections in parallel and groups the results.

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `repo` | string | Required | `owner/repo` |
| `query` | string | Required | Trimmed, nonempty query; GitHub search syntax supported |
| `kind` | enum | `all` | `code`, `issues`, `prs`, or `all` |
| `state` | enum | `all` | `open`, `closed`, or `all`; ignored for code |
| `maxResults` | integer | `5` | 1–10 **per kind**; `all` can return up to three times this number |

`kind: "all"` includes authenticated code search. For public searches without a
token, explicitly choose `"issues"` or `"prs"`.

```json
{
  "repo": "example/project",
  "query": "label:bug",
  "kind": "issues",
  "state": "open",
  "maxResults": 3
}
```

When all requested sections fail, `isError` is true. A successful search with
zero matches is not a failure. Partial success retains successful sections and
explicit section errors, except that a detected GitHub primary rate-limit error
currently stops the whole call and reports the rate-limit message. Unrequested
sections are not counted as successes. Code search also depends on GitHub's
indexing and search restrictions; it is not a full local-repository search.

## Provider limitations

Parameters remain in the published schemas across provider selections. The
tool descriptions identify active-provider limitations; accepted parameters do
not imply identical capabilities.

| Capability | Tavily | SearXNG | Firecrawl |
| --- | --- | --- | --- |
| Web search | Yes | Yes | Not used for search |
| Page reading | Yes | No | Yes, v2 scrape |
| `includeAnswer` | Provider-generated answer | Ignored | Not applicable |
| Domain filters | Native provider filters | Post-filtered; can return fewer results | Not applicable |
| `searchDepth` | Forwarded | Ignored | Not applicable |
| `topic=finance` | Forwarded | Maps to general | Not applicable |
| `startDate`, `endDate` | Forwarded | Ignored | Not applicable |
| `timeRange` | Forwarded | Forwarded; instance/engine support varies, including `week` | Not applicable |
| `extractDepth=advanced` | Provider advanced extraction (2 credits per 5 URLs) | Not applicable | No effect |
| `query` on reads | Returns up to 3 relevant passages instead of the page, same cost | Not applicable | Ignored |
| `includeImages` on reads | Image URL list under each page | Not applicable | Ignored |
| Boilerplate removal | Not guaranteed | Not applicable | Always on (`onlyMainContent: true`) |
| `credit_balance` | When selected for search | Unsupported error | Not supported |

Provider contracts checked 2026-11-20 (Tavily `query` chunking measured live
2026-11-23):
[Tavily Search](https://docs.tavily.com/api-reference/endpoint/search),
[Tavily Extract](https://docs.tavily.com/api-reference/endpoint/extract),
[SearXNG Search API](https://docs.searxng.org/dev/search_api.html), and
[Firecrawl v2](https://docs.firecrawl.dev/migrate-to-v2).
