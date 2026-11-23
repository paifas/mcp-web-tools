# Contributing

Use **Node.js ≥22.13.0** and npm from the repository root.

## Repository map

The runtime path is **MCP client → tool validation → cache/provider → formatted
result**. The model and client decide which tools to call; this package supplies
the tools, not a model or chat UI.

| Files | What they do |
| --- | --- |
| `src/index.ts` | Starts the stdio MCP server, registers the six tools, handles shutdown |
| `src/config.ts`, `src/types.ts` | Validates environment configuration and defines normalized response types |
| `src/providers/search-provider.ts`, `extract-provider.ts`, `registry.ts`, `utils.ts` | Provider interfaces, selection, and shared helpers |
| `src/providers/searxng/`, `tavily/`, `firecrawl/` | Actual upstream API integrations; Tavily's `client/` contains its HTTP client |
| `src/tools/web-search/`, `web-reader/` | Web-tool schemas, validation, formatting, and cache/error handling |
| `src/tools/github/` | GitHub API client plus directory, file, and repository-search tools |
| `src/tools/credit-balance/` | Account-plan allowance reporting |
| `src/utils/cache/`, `format/`, `url.ts` | LRU/TTL cache, Markdown/image formatting, and URL syntax/credential checks |
| `**/*.test.ts` | Regression tests alongside the code they exercise |
| `test/helpers.ts`, `test/setup.ts` | In-memory MCP test client and guard against unexpected external fetches |
| `vitest.config.ts` | Test discovery, setup, and production-source coverage |
| `scripts/smoke.mjs`, `scripts/fixture-fetch.mjs` | Installs a local package tarball and tests it against controlled HTTP fixtures |
| `.github/workflows/checks.yml` | Linux CI checks on Node 22, 24, and 26 |
| `package.json`, `package-lock.json` | Package metadata/scripts/publish allowlist and exact dependency graph |
| `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore` | Compiler, lint, and formatting settings |
| `README.md` | Short introduction and recommended free-tier setup |
| `docs/clients.md`, `configuration.md`, `tools.md` | Client setup, environment settings, and tool contracts |
| `docs/self-hosting.md`, `troubleshooting.md` | Deployment references and diagnosing failures |
| `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE` | Development/release process, trust boundaries, changes, and license |
| `.gitignore` | Keeps generated output, local configuration, and private test artifacts out of Git |

The fixture scripts are **test-only**: normal MCP startup does not import them,
and they are not shipped in npm. The real provider adapters make real API calls.

### Keep versus ignore

Keep source, tests, CI, documentation, and **`package-lock.json`** in Git. A large
lockfile diff is normal after a dependency refresh; it is needed for reproducible
installs. Removed lines in a diff can be replacements, not removed features or
deleted files.

Ignored/generated files include `node_modules/`, `build/`, `coverage/`, `.vitest/`,
root `mcp-web-tools-*.tgz` archives, `npm-debug.log*`, and `.DS_Store`.
Local `.env` variants and `.npmrc` may hold credentials. Only secret-free
`.env.example` / `.env.*.example` templates remain reviewable.

Use **`.local/` at the repository root** for disposable integration configuration,
staged packages, and private run output. Git ignore is not encryption: protect
permissions, redact shared output, and never put real keys in example files.
Ignore rules do not remove files already tracked by Git.

Git contents and npm contents are different: `build/` is ignored
by Git but intentionally published, while tests and scripts are excluded by the
package's explicit `files` allowlist.

## Install and check

```sh
npm ci
npm run check
```

`check` runs typechecking, tests, lint, formatting checks, build, and package/stdio
smoke verification. Individual commands remain available:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript checks without emitting build files |
| `npm test` | Vitest suite |
| `npm run test:watch` | Interactive test development |
| `npm run test:coverage` | Coverage including production source, not only imported files |
| `npm run lint` | ESLint |
| `npm run format:check` | Source formatting checks |
| `npm run build` | Compile the executable into `build/` |
| `npm run smoke` | Isolated stdio/packed-package checks using local fixtures |
| `npm run check:release` | Full `check` plus dependency audit gates |
| `npm run dev` | Run the source stdio server with tsx |
| `npm start` | Run the compiled stdio server |

Normal tests and smoke checks use local/intercepted fixtures and fake
credentials, not paid/provider requests. Do not require real API keys or depend
on public search instances in the normal suite. Installing packages and running
dependency audits can contact the npm registry.

For a quick iteration, run `npm test`. To test packaging alone, run
`npm run build && npm run smoke`; `npm run check` already includes both.

The CI workflow targets **Linux with Node 22, 24, and 26**. A configured matrix
is not evidence that those jobs have passed; check the actual workflow run.
Document local environments and failures separately from CI results.

## Change guidance

- Preserve the six tool names and existing parameter contracts unless a
  compatibility change is deliberate and documented.
- Test behavior through real adapters/handlers or MCP, especially errors,
  partial failures, caching, generated schemas, and validation. Avoid tests that
  copy production logic.
- Keep stdout JSON-RPC-only; use stderr for diagnostics.
- Do not log keys. Debug queries and provider errors can contain sensitive
  information; sanitize issue reports and fixtures.
- Update [tool/configuration docs](docs/tools.md), examples, and the
  [Unreleased changelog](CHANGELOG.md#unreleased) when contracts change.
- Label examples as illustrative/fixture-based unless observed live. Record
  the source-check date for provider quota and client-configuration claims.

Use the locked dependency graph and review compatible updates, including
transitives. Do not suppress peer conflicts or use `npm audit fix --force` as a
substitute for reviewing migrations. The current toolchain deliberately uses
TypeScript 6.0.x because the selected typescript-eslint supports `<6.1.0`;
Node typings track the minimum supported runtime major, Node 22.

## Release validation

Run:

```sh
npm run check:release
npm run test:coverage
npm audit --omit=dev
npm pack --dry-run
```

Review the package contents, executable entry point, dependency audit findings,
and changelog against the proposed release. `check:release` includes the package
smoke check; `npm pack --dry-run` is an additional content review. A fixture
success does not establish live provider availability, quotas, real model task
quality, or production self-hosting readiness.

Before describing a client/model combination as verified, record the exact
versions, provider configuration, real tool calls, failures, context/cost
observations, and whether the evidence was live or mocked. Live checks can
consume allowance and should be separate from routine tests.

Running validation does not publish a release. Versioning, tagging, and npm
publication are separate maintainer actions.

For behavioral context, see the [tool contracts](docs/tools.md).
For sensitive reports, see [Security](SECURITY.md).
