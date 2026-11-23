# Changelog

## Unreleased

Nothing yet.

## 0.9.0

### Added

- `web_read` accepts an optional **`query`**: what to find on the page. Tavily
  then returns only the most relevant passages instead of the whole page, for the
  same credit cost. On one documentation page this reduced the result from
  71,433 to 2,149 characters. Ignored by Firecrawl, which has no such option.
- **`WEBTOOLS_MAX_CHARS`** (default `20000`): each page returned by `web_read` is
  cut at a paragraph boundary and ends with a notice such as
  `[truncated: showing 20000 of 71433 characters]`, so the model knows content is
  missing. `0` disables the limit. The full response stays in the cache.

### Changed

- **Firecrawl now always requests `onlyMainContent: true`**, a deterministic
  filter that removes navigation, headers and footers. Previously only
  `extractDepth: "advanced"` enabled it. `extractDepth` no longer affects
  Firecrawl. This costs nothing extra and produces cleaner pages.

## 0.8.0

### Compatibility changes

- Minimum supported Node.js is now **22.13.0**, replacing the advertised Node 18
  floor.
- Firecrawl uses **`/v2/scrape`** for hosted and custom endpoints. Custom v1-only
  deployments need an upgrade. Firecrawl's official hosted v1 retirement is
  **2026-12-10 at 15:00 UTC**.
- Invalid numeric environment strings, provider/depth values, active endpoint
  URLs, empty search queries, fractional result counts, invalid dates, and
  credential-bearing target URLs are rejected more strictly.

### Fixed

- Total read failure is an MCP error; mixed results preserve successful pages
  and per-URL failures. Only complete successful reads enter the response cache.
- Firecrawl validates success envelopes, distinguishes missing Markdown from a
  valid empty string, and preserves useful error information.
- Firecrawl 429 handling allows at most three attempts and 15 seconds of total
  retry waiting per URL, honors seconds/HTTP-date `Retry-After`, and uses a
  five-second fallback for absent/invalid headers. Per-fetch timeout remains
  30 seconds; a long requested wait fails rather than retrying early.
- Requested Tavily image URLs appear under their source pages, and Tavily
  response times are converted from seconds to milliseconds.
- GitHub search counts only requested sections when deciding total failure,
  preserves partial results, and explains code-search authentication.
- GitHub paths encode reserved filename characters by segment and reject
  traversal; oversized/unsupported inline files are not mislabeled empty.
- `credit_balance` identifies Tavily account-plan allowance rather than
  implying guaranteed capacity for a key or pay-as-you-go usage.

### Maintenance and documentation

- Refreshed compatible dependencies, including Zod 4 and Vitest 5; TypeScript
  stays on 6.0.x for typescript-eslint compatibility, with Node 22 typings.
- Added real-handler regressions, source-inclusive coverage, isolated
  stdio/packed-package smoke checks, aggregate/release checks, and a Linux CI
  matrix for Node 22/24/26. The matrix definition is not a claim of executed CI.
- Restructured docs around the existing one-key Tavily recurring-free path,
  with client, configuration, tool, self-hosting, troubleshooting, contributor,
  and security guidance.

The six tool names and runtime provider defaults are retained: public SearXNG
search plus keyless Firecrawl reading remains the best-effort no-config path.
Tavily search still selects Tavily reading when extraction is not overridden.
Firecrawl `onlyMainContent` is still false unless `extractDepth` is `"advanced"`.
