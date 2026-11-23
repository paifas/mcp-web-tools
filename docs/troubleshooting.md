# Troubleshooting

[README](../README.md) · [Clients](clients.md) · [Configuration](configuration.md)

Start with the MCP connection, then the selected provider, then the model's tool
use. Tool discovery can work even when a provider key is invalid or a public
endpoint is unavailable.

## Server does not connect

- Confirm that the client's `node` is **≥22.13.0** and that it can find `npx`.
  Desktop app PATH/environment can differ from your terminal.
- Verify the configuration shape: OpenCode V2 uses `mcp.servers` and
  `environment`; clients following LM Studio's notation use `mcpServers` and
  `env`. See the complete [examples](clients.md).
- Inspect stderr for a startup error. Malformed integer settings, invalid
  provider/depth enums, invalid active base URLs, or a missing required Tavily
  key fail early. Use plain integer strings, such as `"3600"`, not `"1h"`.
- `npx` may need registry access on first use. To isolate package fetching, use a
  [local build](clients.md#run-this-checkout).
- Do not expect a terminal prompt or localhost web page. This is stdio MCP, and
  stdout must contain only protocol messages.

An empty OpenCode `{env:TAVILY_API_KEY}` reference means that variable was not
available to the OpenCode process. Shell-style `$NAME` in a JSON string does not
interpolate there.

## `web_read` is missing

Check for `WEBTOOLS_EXTRACT_PROVIDER=none`. That setting deliberately removes
the tool. Reconnect the MCP process after changing its environment. OpenCode
automatically reloads MCP configuration after saving it.

## Tavily errors or a surprising balance

- **401:** check the key supplied to the actual MCP process.
- **429 / usage-limit errors:** inspect the provider message and dashboard.
  Request-rate, account-plan, per-key, and pay-as-you-go limits are different.
  Avoid repeatedly submitting the same failing request.
- **Balance appears available but calls fail:** `credit_balance` reports account
  plan allowance only. It is not a spendable balance for every key.
- **Balance unsupported with Tavily reading:** the usage tool follows the
  **search** provider. SearXNG search plus Tavily reading still returns unsupported.

Tavily's recurring free credits are shared by search and extraction. See the
[current policy](https://docs.tavily.com/documentation/api-credits); this package
does not enforce a spending cap or select a paid fallback.

## SearXNG 403, HTML instead of JSON, or 429

For your own instance, ensure `search.formats` includes `json`. Public operators
may intentionally disable automated/JSON access. A 403 can also come from
access controls; check the instance's policy rather than assuming a settings bug.

For 429, wait or configure limits appropriate to your own deployment. Do not
bypass a public operator's restrictions. Use an instance you are authorized to
query, or explicitly select Tavily. The bundled public instance is best-effort.

If a reverse proxy serves SearXNG under `/searx/`, the adapter currently drops
that prefix and calls `/search` on the origin. Use an origin-root endpoint or a
dedicated hostname.

## Firecrawl 429, 404/410, or timeout

- **429:** keyless Cloud access has daily per-IP request and credit caps.
  Shared public IPs can share those limits. There is no promised keyless
  monthly quota. Follow the provider's wait/reset information; a key's account
  limits may also apply.
- **Retry budget exhausted:** at most 3 attempts and 15 seconds of total retry
  waiting per URL are allowed. A longer valid `Retry-After` causes failure,
  rather than an early retry. The provider may require a much longer wait.
- **404:** check that the base URL excludes `/v2/scrape` and that the deployment
  supports the v2 route.
- **410 from hosted v1:** the official retirement is **2026-12-10 15:00 UTC**.
  Confirm which package/build your client actually launches; this checkout
  uses v2. See [migration notes](self-hosting.md#migrating-a-v1-deployment).
- **Timeout:** each Firecrawl fetch attempt has a 30-second timeout. Check the
  scraper's logs and network access; reduce the number of URLs while diagnosing.
  There is no overall multi-URL deadline or propagated MCP cancellation.
- **Malformed success:** missing Markdown or an invalid success envelope is an
  extraction failure. A present but empty Markdown string is valid.

Firecrawl always sends `onlyMainContent: true`, which removes navigation, headers
and footers, but does not guarantee perfect cleanup. `extractDepth` has no effect
on Firecrawl. `includeImages` and `query` are only supported with Tavily.

## Some URLs succeed and others fail

Inspect the `Failed:` section even when the tool call is not marked as an error.
Zero successes marks the whole call `isError: true`; mixed results preserve
successful pages. Neither total nor partial failures are cached.

Retry only failed URLs where possible. Resubmitting the whole partial batch
repeats successful work and can consume more allowance. Successful complete
requests are cached for one hour by default; disable caching and reconnect if
you need a fresh read.

## GitHub errors

- **Code search 401:** supply an appropriate `GITHUB_TOKEN`, or select
  `kind: "issues"` / `"prs"` for anonymous public searches. Default `kind: "all"`
  includes code search.
- **403 / 429:** obey GitHub's reset/wait information. Search and secondary
  limits are tighter than the general REST hourly allowance.
- **404:** check repository, path, ref, and token access. Private resources can
  appear not found when authorization is missing.
- **Large/unsupported file:** the reader limits files to 512 KiB and rejects
  unsupported inline encoding or detected binary data. It does not truncate
  such files or silently treat them as empty.
- **Reserved characters in a filename:** pass literal path text, such as
  `notes#draft.md`, not an already URL-encoded path.

`github_search_repo` distinguishes all-requested-sections failure from partial
success and a successful search with zero results. Read section errors.
A detected GitHub primary rate-limit error currently stops the whole call,
even if another section succeeded.

## The model overflows context, or a page comes back cut short

Start with 3 search results and one read URL. Ask for a search first, then choose
a page. Select only the GitHub search kind you need.

- **Output ends with `[truncated: showing N of M characters]`:** the page was
  longer than `WEBTOOLS_MAX_CHARS` (default 20,000). The model knows content is
  missing. Pass `query` so Tavily returns only the relevant passages, raise the
  setting, or set it to `0` to remove the limit.
- **The client itself cut the result** (for example Claude Code's "Output too
  large… saved to" notice): that truncation is the client's, after ours. Coding
  agents can read the saved file; chat UIs such as LM Studio and Open WebUI
  cannot, so use `query` there.
- **A 512 KiB repository file** from `github_read_file` is not subject to
  `WEBTOOLS_MAX_CHARS`; it has its own size limit.

Confirm tools are enabled in the client and inspect actual calls/results.
An assistant's confident prose is not evidence it called the tool. The project
does not publish a verified client/model compatibility matrix or token benchmark.

## Collect useful diagnostics

Record package/build version, Node version, client/version, selected providers,
the tool and sanitized arguments, and the complete sanitized error. State
whether the issue occurs with a source build or a published package.

Temporarily set `WEBTOOLS_DEBUG=1` in the MCP process environment for cache/retry
logs on stderr. **Logs include search queries**; unset it after diagnosis.
`WEBTOOLS_DEBUG=0` still enables logging. Remove tokens, private URLs/repository
content, sensitive queries, and provider response details before sharing logs.

Use the [issue tracker](https://github.com/paifas/mcp-web-tools/issues) for
non-sensitive bug reports. For security-sensitive reports, see
[Security](../SECURITY.md#reporting-a-security-issue).
