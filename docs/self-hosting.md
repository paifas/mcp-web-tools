# Optional self-hosting

[README](../README.md) · [Configuration](configuration.md) · [Security](../SECURITY.md)

SearXNG supplies **search**; Firecrawl supplies **page reading**. You can operate
either independently, or both. Self-hosting moves those services under your
control, but still requires outbound connections to search engines and target
websites. Hardware, electricity/hosting, maintenance, and optional upstream
services have costs.

This guide links upstream deployment instructions and shows how to connect
them. The examples are **illustrative**, not a deployment tested by this project.

## SearXNG search

Follow the official [installation/container guide](https://docs.searxng.org/admin/installation-docker.html)
and [settings reference](https://docs.searxng.org/admin/settings/settings.html).
The instance must enable JSON search responses. Illustrative settings fragment:

```yaml
use_default_settings: true
search:
  formats:
    - html
    - json
```

Merge that into your deployment's settings; it is not a complete production
configuration. Configure access controls and request limits appropriate to your
own automated client. Do not disable protection on a public service just to
work around a 429.

Set `SEARXNG_URL` to an origin such as `http://localhost:8080`. The adapter calls
`/search?…&format=json`; reverse-proxy path prefixes are currently not preserved.
SearXNG does not implement `web_read`, and pointing at it does not disable the
configured extraction provider.

[SearXNG's Search API documentation](https://docs.searxng.org/dev/search_api.html)
warns that many public instances disable JSON. A public instance's HTML search
page working in a browser does not establish API access.

## Firecrawl v2 reading

Use a deployment compatible with **`POST /v2/scrape`**. Recommended upstream
starting references, checked 2026-11-20:

- [Official self-hosting guide, pinned to `v2.11.162`](https://docs.firecrawl.dev/contributing/self-host)
- [Version-pinned `v2.11.162` Compose source](https://github.com/firecrawl/firecrawl/blob/v2.11.162/docker-compose.yaml)

Match the release's code and configuration. The official guide uses Docker
Compose v2 and a multi-service stack with the API/workers, PostgreSQL, RabbitMQ,
Redis, and Playwright; the pinned Compose file also contains FoundationDB
components. Review that exact file when sizing and operating the deployment.
There is no verified minimum host size supplied here.

The upstream first-run example disables API authentication and is for a trusted
network. It does not provide a complete production architecture, durable
storage design, TLS, or high availability. Keep it off untrusted networks and
follow upstream guidance for authentication, network boundaries, upgrades,
storage, and recovery before wider use.

Ordinary Markdown scraping does not require a paid LLM. Firecrawl's separate
LLM-backed extraction features and optional proxy/parsing services have other
requirements and data flows. This package uses the Markdown scrape route only;
self-hosting does not imply every Firecrawl Cloud capability is available.

### Connect your verified services

After independently verifying your deployments, put these **illustrative
environment settings** into the [client configuration](clients.md):

```json
{
  "WEBTOOLS_SEARCH_PROVIDER": "searxng",
  "SEARXNG_URL": "http://localhost:8080",
  "WEBTOOLS_EXTRACT_PROVIDER": "firecrawl",
  "FIRECRAWL_URL": "http://localhost:3002"
}
```

Use the Firecrawl base URL without `/v2` or `/scrape`. `localhost` refers to the
machine/network namespace of the MCP process; a client running in a container
or on a remote host may need a different reachable address.

Omit `FIRECRAWL_API_KEY` for a trusted deployment that does not require it.
If set, this package sends the key as a bearer token to **your configured
endpoint**, even if that endpoint ignores authentication. Setting the variable
does not enable authentication on the server.

The MCP process's 30-second Firecrawl fetch timeout is independent of any
longer timeout used by upstream deployment verification commands. A successful
health endpoint is also not proof that a full scrape completes.

### Migrating a v1 deployment

Firecrawl's [official retirement notice](https://docs.firecrawl.dev/migrate-to-v2)
says hosted v1 endpoints will return HTTP 410 from **2026-12-10 at 15:00 UTC**.
This checkout uses v2 for both hosted and custom endpoints. An older custom
deployment that only supports v1 must be upgraded or replaced with a compatible
deployment. There is no automatic v1 or hosted-cloud fallback.

## Network boundaries

For self-hosted extraction, target URLs are fetched from the scraper's network
environment, which may reach internal services your local client cannot reach.
URL syntax/credential checks in this MCP server are **not DNS- or redirect-aware
SSRF protection**. Enforce target/network restrictions at the scraper and its
infrastructure. See the complete [data-flow and trust notes](../SECURITY.md).
