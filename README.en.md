# dsh-mcp-hub

**English** · [中文](README.md)

A single place to manage every MCP server in DeepSeek Harness (dsh): add, edit, delete, inspect, start/stop, probe and restart — without editing YAML by hand.

The plugin registers a management page under **Settings → MCP** and optionally a **MCP** icon in the left sidebar that opens the same page as a full main panel. It drives the stock `@deepseek-ai/dsh-mcp-manager` fleet and also lists statically composed `@deepseek-ai/dsh-mcp-client` rows, so both the managed fleet and static rows are visible in one place.

## Features

- **Managed servers, full CRUD**
  - `stdio` and `streamable-http` transports;
  - add with a form or by pasting JSON (Claude Desktop / Cursor `mcpServers` format supported);
  - changes are written to the current profile and applied live — no restart;
  - enable/disable without deleting the entry;
  - one-click probe (connect + list tools) and restart (fresh connection, reset reconnect budget);
  - live status, tool count, tool names and full configuration.
- **Static rows**
  - lists `@deepseek-ai/dsh-mcp-client` rows declared by the profile or a plugin patch;
  - inspect status/tools, enable or disable the row, edit its configuration;
  - the row belongs to its patch, so the page does not delete it.
- **Import from other apps**
  - read-only scan of Claude Desktop, Cursor, VS Code, Windsurf, Cline, Roo Code, Trae and Claude Code MCP files;
  - imported servers become managed servers; source files are never modified.
- **Sidebar shortcut**
  - a switch shows or hides an MCP entry in the DSH sidebar;
  - the entry opens the manager as a global main panel;
  - the choice is stored in `$DSH_HOME/dsh-mcp-hub/preferences.json`.
- **UI**
  - follows the DSH theme tokens and light/dark palettes;
  - native modal `<dialog>`, keyboard support, labelled controls;
  - bilingual (follows the DSH language).

## Compatibility

| Item | Requirement |
| --- | --- |
| DeepSeek Harness | `>=0.2.2-rc.1 <0.3.0` |
| Surface | Web and Desktop GUI |
| Required row | `@deepseek-ai/dsh-mcp-manager` composed in the profile (shipped Web/Desktop compositions already have it) |
| Node.js | `>=22` (provided by DSH; nothing extra to install) |

Discovery paths are adapted per platform (Windows, macOS, Linux); missing applications are skipped.

## Install

### DSH GUI

1. Open **Plugins** in the left sidebar.
2. Choose **Add plugin**.
3. Use one of:
   - GitHub: `github:<your-name>/dsh-mcp-hub`
   - a local checkout: absolute directory path
   - your own scoped npm package name once published (for example `@your-name/dsh-mcp-hub`)
4. Install, enable the bundle, then reopen Settings.

> **Note:** the npm name `dsh-mcp-hub` is reserved by someone else and is **not this project**. This project is installed from GitHub or a local directory; if you publish it later, use your own scope and update this page.

### CLI

```powershell
dsh plugin --profile web add github:<your-name>/dsh-mcp-hub
```

> The Desktop app owns the `desktop` profile and refuses CLI changes; install it from the sidebar **Plugins** page there.

The bundle appears on the sidebar **Plugins** page as **MCP hub / MCP 中心**.

## Quick start

1. Open **Settings → MCP**, or click **MCP** in the left sidebar.
2. Choose **Add server**.
3. Fill the form or switch to the **JSON** tab and paste a document.
4. Save. The server mounts immediately and its tools appear as `mcp__<server>__<tool>` — no restart.

### stdio

| Field | Value |
| --- | --- |
| Name | `github` |
| Transport | `stdio` |
| Command | `npx` |
| Arguments (one per line) | `-y`<br>`@modelcontextprotocol/server-github` |
| Environment | `GITHUB_TOKEN=${credential:GITHUB_TOKEN}` |

### Streamable HTTP

| Field | Value |
| --- | --- |
| Name | `web` |
| Transport | `Streamable HTTP` |
| URL | `https://example.com/mcp` |
| Headers | `Authorization: Bearer ${credential:MCP_TOKEN}` |

### JSON

Claude Desktop / Cursor documents work as-is (multiple servers allowed):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${credential:GITHUB_TOKEN}"
      }
    },
    "web": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${credential:MCP_TOKEN}"
      }
    }
  }
}
```

Also accepted: DSH's `{ "servers": { ... } }` wrapper, a plain `{ "name": { ... } }` map, or a single server object with `name` / `serverName` (the name may be omitted when editing). `type: "http"` means Streamable HTTP; the legacy `sse` transport is refused with a clear message.

## Managed vs static

| | Managed servers | Static rows |
| --- | --- | --- |
| Stored in | `@deepseek-ai/dsh-mcp-manager`'s `config.servers` (written to the profile patch) | standalone `@deepseek-ai/dsh-mcp-client` rows in a profile or plugin patch |
| Mounted by | the MCP manager, live | the DSH Loader at startup/reload |
| This page | add, edit, delete, enable/disable, probe, restart | inspect, enable/disable, edit; **no delete** |
| Delete | from the page | remove the patch row or uninstall the owning plugin |

A base-config server is badged **base config**: it can be disabled but not deleted from the page.

## Where data lives

| Data | Location |
| --- | --- |
| Managed server configuration | current profile's `cordis.patch.yml` (`mcp-manager` row, `config.servers`) |
| Static row overrides | current profile's `cordis.patch.yml` |
| Sidebar preference | `$DSH_HOME/dsh-mcp-hub/preferences.json` |

Every change affects only the current profile.

## Security and privacy

- The Host half serves one authenticated same-origin JSON route, `/dsh-mcp-hub/api`, on the GUI's own web server. No extra port, no public listener.
- No model-facing tool is registered; every operation is user-initiated from the page.
- Configured environment values and headers are shown to the authenticated owner in plain text. Keep secrets in `${credential:REF}` templates so the DSH credentials service resolves them at runtime.
- Import reads other applications' MCP files and never writes or uploads them.
- Toggling a static row changes the profile's plugin enablement; deleting a managed server removes it from the profile.

## Known limitations

- Requires `@deepseek-ai/dsh-mcp-manager`; without it the page can inspect static rows but cannot add managed servers.
- Agent-preset MCP rows are outside this page's scope; it covers the current profile's global plane.
- Static rows cannot be deleted here; they belong to the declaring patch.
- Legacy SSE transport is unsupported; use Streamable HTTP.
- No OAuth flow; provide credentials through environment/header templates.
- Probe output has a timeout and a tool-count cap; oversized lists are truncated and marked.
- The sidebar preference is Host-scoped per profile and cached in the browser; it is not shared across DSH instances/profiles.

## Development

No build step: the Host half is `index.js`, the browser half is `client.js`, both loaded as source.

```text
dsh-mcp-hub/
├── index.js
├── client.js
├── cordis.patch.yml
├── package.json
├── locale/{en,zh}.json
├── icon.svg
├── test/
│   ├── host-smoke.mjs
│   └── client-render-smoke.mjs
├── README.md
├── README.en.md
├── CHANGELOG.md
└── LICENSE
```

```powershell
npm test
```

`test/host-smoke.mjs` runs the Host route against a mocked Harness; `test/client-render-smoke.mjs` renders the page, panels and dialogs with a minimal React stand-in and checks that a plugin reload refreshes the stylesheet.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
