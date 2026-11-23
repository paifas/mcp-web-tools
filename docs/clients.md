# Client setup

[README](../README.md) · [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)

Use Node.js **≥22.13.0** and a client that launches MCP servers over **stdio**.
`mcp-web-tools` is a local process, not an HTTP MCP endpoint. No global npm
installation is required.

Examples here are **illustrative configuration**, checked against the linked
client documentation on 2026-11-23. They are not records of live client/model
tests. Tool use depends on the selected model, client, permissions, and context
window; no model compatibility or token-efficiency claim is implied.

## Where this works well

The tools are the same everywhere; what differs is what the client can do with a
long result.

| Client kind | Examples | Fit |
| --- | --- | --- |
| Coding agents | Claude Code, OpenCode, Kilo Code, Cline | **Full workflow.** They have file tools, so a long page can be saved and searched. |
| Chat UIs | LM Studio, Open WebUI | **Works for search and focused reads.** They have no file tools, so if they truncate a long result the rest is lost. Pass `query` to `web_read`. |

If your client can't open a file, make the model use `query` on `web_read`: with
it, Tavily returns only the relevant passages (about 2 KB instead of 71 KB on one
tested page). The server also cuts each page at 20,000 characters and says so.

## Two configuration shapes

Clients differ only in where the config file lives and which of two shapes it
uses. Find your client in the table below and copy that shape.

### Shape A: `mcpServers`

Used by Claude Code, Cline, and LM Studio. Complete file:

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

If the file already has an `mcpServers` object, add the `mcp-web-tools` entry
inside it rather than pasting a second one.

### Shape B: `mcp.servers`

Used by OpenCode V2 and Kilo Code. The server sits under `mcp` and uses
`environment`. Complete file:

```json
{
  "mcp": {
    "servers": {
      "mcp-web-tools": {
        "type": "local",
        "command": ["npx", "-y", "mcp-web-tools"],
        "environment": {
          "WEBTOOLS_SEARCH_PROVIDER": "tavily",
          "TAVILY_API_KEY": "REPLACE_WITH_YOUR_KEY"
        }
      }
    }
  }
}
```

Both clients can substitute the key from your environment instead of storing it
in the file; see the per-client notes below.

### Where each client keeps its config

| Client | Shape | Project scope | User scope |
| --- | --- | --- | --- |
| Claude Code | A | `.mcp.json` in the project root | `claude mcp add --scope user`, or `~/.claude.json` |
| Cline | A | settings opened from **MCP Servers → Configure** | `~/.cline/data/settings/cline_mcp_settings.json` (CLI) |
| LM Studio | A | — | **Program → Install → Edit mcp.json** |
| OpenCode V2 | B | `opencode.jsonc` or `.opencode/opencode.jsonc` | `~/.config/opencode/opencode.jsonc` |
| Kilo Code | B | `kilo.jsonc` or `.kilo/kilo.jsonc` | `~/.config/kilo/kilo.jsonc` |

Sources: [Claude Code](https://code.claude.com/docs/en/mcp),
[Cline](https://docs.cline.bot/mcp/configuring-mcp-servers),
[LM Studio](https://lmstudio.ai/docs/app/mcp),
[OpenCode](https://opencode.ai/docs/mcp-servers),
[Kilo Code](https://kilo.ai/docs/automate/mcp/using-in-kilo-code).

### Per-client notes

**Claude Code.** A project `.mcp.json` asks for approval the first time you run
`claude` in that folder. To register it without editing JSON:
`claude mcp add mcp-web-tools --env TAVILY_API_KEY=… -- npx -y mcp-web-tools`.
Claude Code may defer loading MCP tools behind a tool search; that is normal. It
saves large tool results to disk and shows a preview, and the model can read the
file.

**Cline.** Entries can also carry `"autoApprove": []` and `"disabled": false`.
Open the file from the **MCP Servers → Configure** tab in the extension, or edit
`cline_mcp_settings.json` directly when using the CLI.

**LM Studio.** The app follows `mcp.json` notation. A local model does not make
this workflow offline: the search and extraction APIs still receive your queries
and URLs. LM Studio's own guide notes MCP context usage, so prefer `query` on
`web_read` with a small context window.

**OpenCode V2.** Make `TAVILY_API_KEY` available to the OpenCode process and
reference it as `{env:TAVILY_API_KEY}` in `environment`. Shell syntax like
`$TAVILY_API_KEY` is not expanded inside JSON. An unset reference becomes empty
and the Tavily configuration fails. OpenCode reloads MCP servers when the config
file is saved; check with `opencode mcp list` or `/mcps`. `.opencode.json` is not
the documented V2 project filename.

**Kilo Code.** The same shape as OpenCode, in `kilo.json`/`kilo.jsonc`. You can
add a server from the settings UI, which writes the file for you. Kilo notes that
MCP tools add to context, so enable only the servers you need.

### Getting the key into the config

Prefer not to store the key in a file that might be committed:

- **OpenCode:** `{env:TAVILY_API_KEY}` reads from the OpenCode process's environment.
- **Claude Code:** `claude mcp add … --env` or `${TAVILY_API_KEY}` in `.mcp.json`.
- **Cline, LM Studio, Kilo Code:** the documented shape stores the value in the
  config file. Keep that file out of version control.

## Pinning and running the source tree

<a id="run-this-checkout"></a>

`npx -y mcp-web-tools` runs the latest published release and may contact the
registry on first use. For a reproducible setup, pin it: `mcp-web-tools@0.8.0`.

To run a source checkout instead of a published release:

```sh
npm ci
npm run build
```

Then launch the compiled entry point directly instead of via `npx`. In shape A,
use this entry (replace both paths and the key):

```json
{
  "mcp-web-tools": {
    "command": "/absolute/path/to/node",
    "args": ["/absolute/path/to/mcp-web-tools/build/index.js"],
    "env": {
      "WEBTOOLS_SEARCH_PROVIDER": "tavily",
      "TAVILY_API_KEY": "tvly-REPLACE_WITH_YOUR_KEY"
    }
  }
}
```

In shape B, set `"command"` to
`["/absolute/path/to/node", "/absolute/path/to/mcp-web-tools/build/index.js"]`
and keep the `environment` object. Rebuild and reconnect after source changes.
The [contributor checks](../CONTRIBUTING.md) run without provider keys.

## Verify the connection and workflow

First inspect the tool list. All six [tools](tools.md) should be present;
disabling extraction leaves five and omits only `web_read`. Tool discovery alone
does not verify a provider key, upstream availability, or model tool use.

For an optional live check, ask the assistant:

> Search for official documentation on a topic I choose, with at most 3 results.
> Read one source with `query` set to the specific fact you need, and answer with
> its URL. Tell me if either tool fails.

This is an **illustrative prompt**, not a recorded result. Running it sends data
to providers and may consume credits. Review the tool calls, the returned URLs,
and any `[truncated …]` or `Failed:` notices rather than treating a fluent answer
as proof of success.
