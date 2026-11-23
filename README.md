# mcp-web-tools

Give a budget or local-model assistant a **search → read → cite** workflow over MCP.
Search for sources, read selected pages as Markdown, and use the existing GitHub
tools when the source is a repository. Search and reading have independently
configurable providers.

## Install

You need **Node.js ≥22.13.0**, npm, and a client that can launch local MCP servers
over stdio. No global npm installation or Docker is needed for the hosted setup.

### One free Tavily key for search and reading

1. Get a key from [Tavily](https://app.tavily.com).
2. Add the following **illustrative configuration** to a client using
   `mcpServers` notation, such as LM Studio. Replace the placeholder locally;
   keep the key out of source control. Merge the entry if the file already has servers.
3. Connect the server and confirm that `web_search` and `web_read` appear.

```json
{
  "mcpServers": {
    "mcp-web-tools": {
      "command": "npx",
      "args": ["-y", "mcp-web-tools"],
      "env": {
        "WEBTOOLS_SEARCH_PROVIDER": "tavily",
        "TAVILY_API_KEY": "tvly-REPLACE_WITH_YOUR_KEY"
      }
    }
  }
}
```

Selecting Tavily for search also selects it for reading unless you explicitly
override `WEBTOOLS_EXTRACT_PROVIDER`. Both reuse the same key.

**Tavily documents 1,000 free credits every month, with no credit card required**
([policy checked 2026-11-20](https://docs.tavily.com/documentation/api-credits)).
Search and reading share those credits: basic search costs 1 credit; basic
extraction costs 1 credit per 5 successful URL extractions. A credit is not a
complete research task. Model inference is separate, and provider policies can change.
Check your provider dashboard before enabling paid capacity.

See [client setup](docs/clients.md) for LM Studio's `mcp.json` editor,
OpenCode V2's different `mcp.servers` shape, and a generic stdio recipe.
These instructions are documentation-based, not a verified client/model compatibility matrix.

**Checkout versus npm:** the [changelog](CHANGELOG.md) describes each release.
`npx` runs the published package, which can lag this source tree between releases.
To run the latest source, [build from the checkout](docs/clients.md#run-this-checkout).

## How it works

1. Call `web_search` with a focused query and a small `maxResults`.
2. Choose useful sources, then call `web_read` with their URLs. Pass `query`
   with what you want to find, and Tavily returns only the relevant passages
   instead of the whole page, at no extra cost.
3. Ask the assistant to cite those URLs and distinguish evidence from inference.

Each page is limited to 20,000 characters, cut at a paragraph boundary with a
notice, so a long page cannot silently fill the context. See
[tool contracts](docs/tools.md) for the `query` option and the length limit.
Model tool-use quality depends on the model and client.

## Example Output

**Illustrative tool call and output, not a live result or benchmark:**

```json
{
  "name": "web_search",
  "arguments": {
    "query": "example documentation",
    "maxResults": 1,
    "includeAnswer": false
  }
}
```

```text
### 1. [Example documentation](https://example.com/docs)
> An illustrative search snippet.

---

Sources:
- [Example documentation](https://example.com/docs)
```

Then read a selected source with
`web_read({"urls":["https://example.com/docs"]})`.

## Customizing backends

<a id="provider-combinations"></a>
<a id="provider-limitations"></a>
<a id="use-tavily-instead-single-key-both-tools"></a>
<a id="firecrawl-options"></a>

| Setup | Search / reading | What to expect |
| --- | --- | --- |
| Recommended hosted start | Tavily / Tavily | One key; recurring free allowance shared across operations |
| Runtime defaults, no environment settings | Public SearXNG / keyless Firecrawl Cloud | Best-effort: public-instance access and daily per-IP scraping caps |
| Optional self-hosted setup | Your SearXNG / your compatible Firecrawl v2 | Operate infrastructure; outbound search and scraping traffic still required |

Runtime defaults remain `https://search.mdosch.de` for SearXNG and
`https://api.firecrawl.dev` for Firecrawl. Public SearXNG instances can disable
JSON or throttle requests. Firecrawl's [keyless policy](https://docs.firecrawl.dev/rate-limits#keyless-no-api-key)
has daily request **and** credit caps per IP; it is not a 1,000-credit monthly allowance.
There is no automatic provider or paid fallback.

<a id="environment-variables"></a>
<a id="use-a-different-searxng-instance"></a>

[Configuration and provider combinations](docs/configuration.md) ·
[Provider capability differences](docs/tools.md#provider-limitations)

<a id="self-hosting-searxng-optional"></a>
<a id="full-self-host-optional"></a>
<a id="searxng-search-default"></a>

[Self-hosting guide](docs/self-hosting.md): SearXNG needs JSON enabled; Firecrawl
must support `/v2/scrape`. The guide links the official `v2.11.162` deployment example.

## Tools

<a id="web_search"></a>
<a id="web_read"></a>
<a id="credit_balance"></a>
<a id="github-tools"></a>
<a id="github_get_repo_structure"></a>
<a id="github_read_file"></a>
<a id="github_search_repo"></a>

| Tool | Purpose |
| --- | --- |
| [`web_search`](docs/tools.md#web_search) | Titles, URLs, snippets, and an optional Tavily-generated answer |
| [`web_read`](docs/tools.md#web_read) | Read 1–20 URLs; preserve successes and report per-URL failures |
| [`credit_balance`](docs/tools.md#credit_balance) | Tavily account-plan allowance when Tavily is the search provider |
| [`github_get_repo_structure`](docs/tools.md#github_get_repo_structure) | List one repository directory |
| [`github_read_file`](docs/tools.md#github_read_file) | Read a text file up to 512 KiB |
| [`github_search_repo`](docs/tools.md#github_search_repo) | Search code, issues, and PRs; code search requires a GitHub token |

Setting `WEBTOOLS_EXTRACT_PROVIDER=none` removes `web_read` from the tool list.
The other five remain registered.

## Security note

This is a **trusted-client stdio server**. Queries and URLs reach the selected
providers; GitHub content reaches the client/model, including private content
when your token permits it. URL validation is not SSRF protection. Debug logs
include search queries. See [security and data flows](SECURITY.md).

## Guides

The npm package includes the executable, README, and the guides linked below.

- [Client setup](docs/clients.md)
- [Configuration](docs/configuration.md) and [tool contracts](docs/tools.md)
- [Self-hosting](docs/self-hosting.md) and [troubleshooting](docs/troubleshooting.md)
- [Contributing and checks](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
