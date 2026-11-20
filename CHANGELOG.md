# Changelog

## 1.1.0 — 2026-11-20

### Added

- Sidebar shortcut: an optional **MCP** entry in the DSH sidebar that opens the
  manager as a global main panel, controlled by a switch on the page.
- Host-backed sidebar preference (`$DSH_HOME/dsh-mcp-hub/preferences.json`) with
  a browser-local cache so the entry registers synchronously at boot.
- Main-panel page layout with its own title, padding and max width.
- Per-server enable/disable, probe and restart actions with per-card progress
  and error feedback.
- JSON editing for managed servers, prefilled from the current configuration.
- Localized error messages driven by the Host's stable error codes.
- `test/host-smoke.mjs` and `test/client-render-smoke.mjs`, run with `npm test`.
- Chinese README as the default document, an English `README.en.md`, an MIT
  license, and a repository `.gitignore`.

### Fixed

- The primary Add/Save buttons kept a near-white theme fill in dark mode and hid
  white text; they now use a stable blue fill with a high-contrast ink.
- The injected stylesheet was created once and never refreshed on a plugin
  reload, so later layout rules were missing until a full page refresh.
- Static-row toggles now report when a change needs a restart.
- Long command/URL/error strings wrap inside cards.

## 1.0.0 — 2026-11-20

### Added

- Initial release.
- Managed MCP servers through `@deepseek-ai/dsh-mcp-manager`: add (form or
  JSON), edit, delete, enable/disable, probe, restart, live status and tools.
- Static `@deepseek-ai/dsh-mcp-client` rows: inspect, enable/disable, edit.
- Import from Claude Desktop, Cursor, VS Code, Windsurf, Cline, Roo Code, Trae
  and Claude Code configuration files.
- Settings section **MCP** with bilingual copy and a plugin icon.
