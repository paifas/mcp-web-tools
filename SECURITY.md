# Security and data flows

## Trust model

`mcp-web-tools` is a local **stdio MCP server for trusted clients**. It is not an
authenticated public gateway or a multi-tenant service. Run it with the
credentials and network access you intend the calling assistant to use.

Tool inputs can be influenced by untrusted web content even when the client
itself is trusted. Search results, page Markdown, GitHub files, and provider
error messages are data, not instructions. This package does not provide a
prompt-injection filter or guarantee safe rendering of arbitrary Markdown.

## Where data goes

| Operation | Data sent / recipient |
| --- | --- |
| Tavily search | Query and search options to `api.tavily.com`; Tavily can generate the optional answer |
| SearXNG search | Query/options in the URL to the configured instance, which queries its configured upstream search engines |
| Tavily reading | Target URLs and extraction options to Tavily |
| Firecrawl reading | Target URLs and scrape options to the configured Firecrawl endpoint; that service fetches targets |
| `credit_balance` with Tavily search | Authenticated usage request to Tavily |
| GitHub tools | Repository paths/refs or search queries to `api.github.com`, with `GITHUB_TOKEN` when configured |
| Tool responses | Retrieved content and errors back to the MCP client, which may send them to its model provider and retain conversation logs |

The package sends tool inputs rather than the entire conversation to search/
extraction APIs. Those inputs can themselves contain sensitive information.
Provider retention and processing follow the provider's policies; the package
does not control them.

Using a local model does not make the web workflow offline. Self-hosted SearXNG
still contacts search engines, and self-hosted Firecrawl still contacts target
websites. Optional scraping proxies, parsers, and AI integrations can add other
recipients. Installing via `npx` can also contact the npm registry.

## URLs and scraper-side network access

The server validates HTTP(S) syntax and rejects credentials embedded in target
URLs and active provider base URLs. It allows localhost/self-hosted endpoints.

**This is not SSRF protection.** There is no private-IP policy, DNS-rebinding
defense, or redirect-aware target validation. The extraction service, not this
stdio process, normally fetches the requested page. Its network environment
determines whether internal/private destinations are reachable. Configure
scraper-side egress and target restrictions according to that environment.

The same trust applies to custom provider endpoints. HTTP is supported for
local deployments; it does not encrypt queries, page URLs, or bearer credentials
on a network.

## Credentials and private GitHub content

- Keep keys out of committed configuration, screenshots, issue reports, and
  model prompts. Use the client's supported secret/environment mechanism.
- OpenCode examples use `{env:…}` substitution. Other clients' configuration
  files may hold plaintext credentials; protect those files accordingly.
- A configured `FIRECRAWL_API_KEY` is sent to `FIRECRAWL_URL`, including custom
  servers. An endpoint ignoring the key does not mean the key was not sent.
  Omit unnecessary keys and trust the endpoint you configure.
- GitHub tools are **not restricted to public repositories**. A token with
  private access can retrieve private code/issues into client/model context.
  Select the minimum repositories and read permissions needed; do not grant
  broad access just to raise rate limits. Code search requires authentication.
- Provider/account quotas and client permissions remain relevant. The server
  does not enforce a monetary spending cap.

## Logging, caching, and limits

`WEBTOOLS_DEBUG` enables stderr diagnostics for any nonempty value, including
`"false"` and `"0"`. **Search queries appear in debug logs.** Provider errors may
also include sensitive response text in tool output. The client may retain both
logs and responses. Redact before sharing; there is no comprehensive
log/error-redaction layer.

Successful search and complete successful read responses live in a process-local
cache, with a default one-hour TTL and 100-entry limit. Partial/total read
failures are not cached. The cache is not written to disk by this package, but
client logs and conversations have separate retention policies. Entry limits
are not byte limits.

The reader accepts at most 20 URLs per call and the GitHub file reader rejects
files over 512 KiB. Each page returned by `web_read` is cut to
`WEBTOOLS_MAX_CHARS` characters (default 20,000) **on output**. That bounds what
reaches the model, not what this process holds: the provider's full response is
still fetched and cached in memory first, and there is no HTTP-response or cache
byte budget. MCP cancellation is not propagated upstream, and there is no overall
multi-URL deadline. Firecrawl's per-fetch timeouts and retry-wait bounds are
documented in the [tool reference](docs/tools.md#firecrawl-retry-bounds); they are
not a comprehensive resource-isolation mechanism.

For deployment-specific controls, use the upstream guidance linked in
[self-hosting](docs/self-hosting.md). The upstream unauthenticated Firecrawl
quickstart is a trusted-network evaluation setup.

## Reporting a security issue

Check the repository's [Security page](https://github.com/paifas/mcp-web-tools/security)
for an available private reporting channel. If private vulnerability reporting
is enabled, use **Report a vulnerability**. If it is unavailable, open a minimal
issue asking the maintainer for a private contact, without exploit details,
credentials, or private content.

Include the affected version/commit, Node version, configuration with secrets
removed, reproduction steps, and observed impact through the private channel.
No response-time or security-support guarantee is stated here.
