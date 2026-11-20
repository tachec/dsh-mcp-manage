/**
 * dsh-mcp-manage — browser half.
 *
 * A Settings section (Settings → MCP) that manages every MCP server the
 * Harness can run:
 *
 *   - managed servers in `@deepseek-ai/dsh-mcp-manager` (add, edit, enable,
 *     disable, probe, restart, delete) with a form or pasted JSON;
 *   - statically composed `@deepseek-ai/dsh-mcp-client` rows (view, enable,
 *     disable, edit, tool list);
 *   - MCP servers found in other agent tools' configuration on this machine,
 *     with one-click import.
 *
 * The Host half owns persistence and validation; this module only renders the
 * snapshot and posts actions to `/dsh-mcp-manage/api`. Plain ModuleLoader bundle:
 * no build step, React from the page's module table.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcp-manage',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const name = 'dsh-mcp-manage'
    const inject = ['slots', 'locale']
    const NS = 'settings.mcpHub'
    const ROUTE = '/dsh-mcp-manage/api'
    const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
    const POLL_MS = 5000
    const SHORTCUT_KEY = 'dsh-mcp-manage.sidebarShortcut'

    /** The sidebar preference as this page last saw it; synchronous at boot. */
    function readLocalShortcut() {
      try {
        if (typeof localStorage === 'undefined') return true
        const stored = localStorage.getItem(SHORTCUT_KEY)
        if (stored === '0') return false
        if (stored === '1') return true
      } catch { /* storage denied: fall back to the default */ }
      return true
    }

    function writeLocalShortcut(enabled) {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(SHORTCUT_KEY, enabled === true ? '1' : '0')
      } catch { /* the Host preference remains authoritative */ }
    }

    // =========================================================================
    // Locale
    // =========================================================================

    const zh = {
      nav: 'MCP',
      title: 'MCP 服务器',
      lead: '集中管理这个 Harness 接入的 MCP 服务器。保存后立即生效，无需重启。',
      refresh: '刷新',
      add: '添加服务器',
      loading: '正在读取 MCP 配置…',
      failed: '操作失败',
      retry: '重试',
      scan: '重新扫描',
      'summary.all': '共 {count} 个托管服务器',
      'summary.connected': '{count} 个已连接',
      'summary.disabled': '{count} 个已停用',
      'summary.static': '静态接入 {count} 个',
      'summary.found': '本机发现 {count} 个可导入',
      'empty.title': '还没有托管服务器',
      'empty.hint': '添加一个 stdio 或 Streamable HTTP 服务器，它的工具会立刻出现在 Agent 的工具列表里。',
      'transport.stdio': 'STDIO',
      'transport.http': 'HTTP',
      'origin.base': '基础配置',
      'origin.profile': '本页添加',
      'origin.override': '已覆盖',
      'status.connected': '已连接 · {count} 个工具',
      'status.connectedAt': '连接于 {time}',
      'status.connecting': '连接中…',
      'status.reconnecting': '重连中（{attempt}/{max}）',
      'status.waiting': '等待凭据',
      'status.failed': '连接失败',
      'status.disabled': '已停用',
      'status.closed': '已关闭',
      'status.unknown': '状态未知',
      'status.rowFailed': '插件行加载失败',
      'status.noTools': '运行中，暂无工具',
      'tools.title': '已注册工具',
      'tools.none': '连接后这里会列出服务器提供的工具。',
      'tools.more': '还有 {count} 个',
      'action.probe': '探测',
      'action.restart': '重启',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.deleteDisabled': '来自基础配置的服务器不能删除，只能停用。',
      'action.import': '导入',
      'action.close': '关闭',
      'action.cancel': '取消',
      'action.save': '保存',
      'action.saving': '保存中…',
      'action.config': '查看配置',
      'action.enable': '启用',
      'action.disable': '停用',
      'status.restarting': '正在重启…',
      'form.close': '关闭超时（毫秒）',
      'form.jsonRequired': '请粘贴 JSON 配置。',
      'form.jsonReplace': 'JSON 会替换这个服务器的完整配置（名称保持不变）。',
      'form.jsonSingleName': '单独写一个服务器对象时需要 "name" 字段。',
      'errors.invalid-name': '名称 “{name}” 不合法：只能使用字母、数字、下划线或连字符，长度 1–32。',
      'errors.duplicate': '服务器 “{name}” 已存在，请换一个名称或直接编辑它。',
      'errors.static-collision': '名字 “{name}” 已被静态配置的 MCP 行占用；请换一个名字，或先停用那一行。',
      'errors.transport-required': '请选择传输方式：stdio 或 streamable-http。',
      'errors.command-required': 'stdio 服务器必须填写启动命令。',
      'errors.url-required': 'streamable-http 服务器必须填写以 http:// 或 https:// 开头的地址。',
      'errors.sse-unsupported': '不支持旧的 SSE 传输；请改用 Streamable HTTP。',
      'errors.invalid-json': 'JSON 格式不正确。',
      'errors.name-required': '单个服务器对象需要一个 name 或 serverName 字段。',
      'errors.invalid-server': '服务器配置格式不正确。',
      'errors.not-found': '找不到服务器 “{name}”。',
      'errors.inherited-readonly': '来自基础配置的服务器不能删除，只能停用。',
      'errors.manager-missing': '当前 profile 没有挂载 MCP 管理器，无法保存托管服务器。',
      'errors.manager-disabled': 'MCP 管理器当前被停用，无法保存托管服务器。',
      'errors.manager-unavailable': 'MCP 管理器还没有就绪，请稍后重试。',
      'errors.settings-missing': '设置服务未就绪，无法保存 MCP 配置。',
      'errors.loader-unavailable': '读取插件清单失败。',
      'errors.disabled': '这个静态 MCP 行已停用，请先启用再编辑。',
      'errors.not-mcp-client': '这个插件行不是 MCP 客户端。',
      'errors.config-editor-missing': '配置编辑服务不可用，无法保存静态 MCP 行。',
      'errors.plugin-manager-missing': '插件管理服务不可用，无法启停静态 MCP 行。',
      'errors.server-required': '缺少服务器配置。',
      'errors.json-name-mismatch': 'JSON 中没有对应的服务器配置。',
      'errors.empty': '没有要添加的服务器。',
      'errors.unknown-action': '未知操作。',
      'errors.body-too-large': '请求体过大。',
      'errors.invalid-body': '请求体格式不正确。',
      'errors.SETTINGS_CONFLICT': '配置已被其他页面修改，请刷新后重试。',
      'errors.invalid-preference': '偏好值不合法。',
      'errors.preferences-write-failed': '保存页面偏好失败。',
      'errors.error': '操作失败，请查看 Host 日志。',
      'notice.saved': '已保存',
      'notice.imported': '已导入',
      'notice.refreshed': '已刷新',
      'notice.restartRequired': '已保存，重启 DSH 后生效。',
      'notice.secrets': '环境变量与请求头会明文保存在 profile 中；密钥请使用 ${credential:REF} 模板，由凭据服务解析。',
      'version.label': '界面版本 1.5',
      'shortcut.title': '左侧栏快捷入口',
      'shortcut.hint': '在 DSH 左侧栏显示 MCP 图标，点击直接打开本页。',
      'confirm.deleteTitle': '删除服务器',
      'confirm.deleteBody': '删除 “{name}” 后，它的工具会立即从 Agent 中移除，配置也会从当前 profile 中删除。',
      'confirm.enableTitle': '启用静态 MCP 行',
      'confirm.enableBody': '启用 “{name}” 会立即挂载这一行并连接服务器。继续？',
      'confirm.disableTitle': '停用静态 MCP 行',
      'confirm.disableBody': '停用 “{name}” 会立即断开并移除它的工具，配置仍保留在 profile 中。继续？',
      'probe.running': '探测中…',
      'probe.ok': '连接成功 · {count} 个工具 · {ms} ms',
      'probe.truncated': '工具列表已截断',
      'probe.failed': '{stage}阶段失败：{message}（{ms} ms）',
      'probe.stage.connect': '连接',
      'probe.stage.list': '列出工具',
      'probe.cleanup': '关闭时有告警：{message}',
      'form.addTitle': '添加 MCP 服务器',
      'form.editTitle': '编辑 {name}',
      'form.staticTitle': '编辑静态 MCP 行 {name}',
      'form.lead': 'stdio 服务器由本机命令启动；Streamable HTTP 服务器通过 URL 连接。',
      'form.tabForm': '表单',
      'form.tabJson': 'JSON',
      'form.name': '名称',
      'form.nameHint': '用于工具前缀 mcp__<名称>__，只能包含字母、数字、下划线、连字符。',
      'form.transport': '传输方式',
      'form.command': '启动命令',
      'form.commandHint': '例如 npx、uvx，或可执行文件的绝对路径。',
      'form.args': '参数',
      'form.argsHint': '每行一个参数，不做 shell 展开。',
      'form.env': '环境变量',
      'form.envHint': '每行 KEY=VALUE；值支持 ${credential:REF} 模板。',
      'form.cwd': '工作目录',
      'form.cwdHint': '可选；留空使用 Harness 进程目录。',
      'form.url': '服务地址',
      'form.urlHint': 'Streamable HTTP 端点，例如 https://example.com/mcp。',
      'form.headers': '请求头',
      'form.headersHint': '每行 Key: Value；值支持 ${credential:REF} 模板。',
      'form.advanced': '高级选项',
      'form.startup': '启动超时（毫秒）',
      'form.call': '调用超时（毫秒）',
      'form.reconnect': '断线自动重连',
      'form.failOnStartup': '启动失败时让插件行加载失败',
      'form.jsonHint': '粘贴 Claude Desktop / Cursor 的 mcpServers 配置、DSH 的 servers 配置，或单个服务器对象；一次可以添加多个。',
      'form.jsonEditHint': '只修改当前服务器：可以只写一个服务器对象，名称保持为 “{name}”。',
      'form.jsonPlaceholder': '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n      "env": { "GITHUB_TOKEN": "..." }\n    }\n  }\n}',
      'form.requiredCommand': '请填写启动命令。',
      'form.requiredUrl': '请填写以 http:// 或 https:// 开头的地址。',
      'form.badName': '名称不合法：只能使用字母、数字、下划线或连字符，长度 1–32。',
      'form.nameTaken': '这个名称已经存在。',
      'form.advancedHint': '留空表示使用默认值。',
      'static.title': '静态接入',
      'static.lead': '这些服务器由 profile 或插件补丁里的 @deepseek-ai/dsh-mcp-client 行挂载。可以在这里启停、编辑或查看工具；删除需要在对应的补丁里移除。',
      'static.disabledHint': '这一行已停用；启用后才能编辑配置。',
      'static.conflict': '与托管服务器同名，可能无法同时运行。',
      'static.empty': '没有静态接入的 MCP 行。',
      'static.phase': '插件状态：{phase}',
      'phase.pending': '等待加载',
      'phase.loading': '加载中',
      'phase.active': '运行中',
      'phase.failed': '加载失败',
      'phase.unloading': '卸载中',
      'discover.title': '从本机其他应用导入',
      'discover.lead': '读取本机已有的 MCP 配置（只读），导入后由本页托管。',
      'discover.empty': '没有在本机常见 MCP 配置文件中找到服务器。',
      'discover.import': '导入',
      'discover.importing': '导入中…',
      'discover.found': '{count} 个服务器',
      'discover.fileError': '读取失败：{message}',
      'discover.rowError': '无法导入：{message}',
      'discover.already': '已在托管列表中',
      'note.title': '写入位置',
      'note.body': '托管服务器通过设置服务写入当前 profile 的 cordis.patch.yml；静态行通过配置编辑器与插件管理器修改。所有更改只影响当前 profile。',
      'manager.missing': '没有检测到 MCP 管理器（@deepseek-ai/dsh-mcp-manager），无法添加托管服务器。',
      'manager.disabled': 'MCP 管理器已被停用，托管服务器暂不可编辑。',
      'manager.unavailable': 'MCP 管理器尚未就绪，请稍后刷新。',
      'capability.unavailable': '静态行编辑不可用：缺少配置编辑或插件管理服务。',
      'warn.title': '提示',
      'env.title': '环境变量',
      'headers.title': '请求头',
      'config.transport': '传输',
      'config.command': '命令',
      'config.url': '地址',
      'config.cwd': '工作目录',
      'config.startup': '启动超时',
      'config.call': '调用超时',
      'config.reconnect': '自动重连',
      'config.enabled': '启用',
      'config.none': '无额外配置',
      'config.on': '开',
      'config.off': '关',
      copy: '复制',
      copied: '已复制',
      'error.http': 'Host 返回了 {status}，MCP 管理页的后端可能还没有加载。',
    }

    const en = {
      nav: 'MCP',
      title: 'MCP servers',
      lead: 'Every MCP server this Harness can use, in one place. Changes apply immediately; no restart needed.',
      refresh: 'Refresh',
      add: 'Add server',
      loading: 'Reading MCP configuration…',
      failed: 'Operation failed',
      retry: 'Retry',
      scan: 'Scan again',
      'summary.all': '{count} managed server(s)',
      'summary.connected': '{count} connected',
      'summary.disabled': '{count} disabled',
      'summary.static': '{count} statically composed',
      'summary.found': '{count} importable on this machine',
      'empty.title': 'No managed servers yet',
      'empty.hint': 'Add a stdio or Streamable HTTP server and its tools appear in the agent tool list right away.',
      'transport.stdio': 'STDIO',
      'transport.http': 'HTTP',
      'origin.base': 'base config',
      'origin.profile': 'added here',
      'origin.override': 'overridden',
      'status.connected': 'Connected · {count} tools',
      'status.connectedAt': 'connected at {time}',
      'status.connecting': 'Connecting…',
      'status.reconnecting': 'Reconnecting ({attempt}/{max})',
      'status.waiting': 'Waiting for credentials',
      'status.failed': 'Connection failed',
      'status.disabled': 'Disabled',
      'status.closed': 'Closed',
      'status.unknown': 'Unknown state',
      'status.rowFailed': 'Plugin row failed to load',
      'status.noTools': 'Running, no tools yet',
      'tools.title': 'Registered tools',
      'tools.none': 'Tools this server provides appear here once it connects.',
      'tools.more': '{count} more',
      'action.probe': 'Probe',
      'action.restart': 'Restart',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.deleteDisabled': 'A base-config server cannot be deleted; disable it instead.',
      'action.import': 'Import',
      'action.close': 'Close',
      'action.cancel': 'Cancel',
      'action.save': 'Save',
      'action.saving': 'Saving…',
      'action.config': 'Configuration',
      'action.enable': 'Enable',
      'action.disable': 'Disable',
      'status.restarting': 'Restarting…',
      'form.close': 'Close timeout (ms)',
      'form.jsonRequired': 'Paste a JSON configuration.',
      'form.jsonReplace': 'JSON replaces this server’s whole configuration (the name stays).',
      'form.jsonSingleName': 'A standalone server object needs a "name" field.',
      'errors.invalid-name': 'Invalid name “{name}”: letters, digits, underscore or hyphen, 1–32 characters.',
      'errors.duplicate': 'Server “{name}” already exists; rename it or edit it instead.',
      'errors.static-collision': '“{name}” is used by a statically composed MCP row; pick another name or disable that row first.',
      'errors.transport-required': 'Choose a transport: stdio or streamable-http.',
      'errors.command-required': 'A stdio server needs a command.',
      'errors.url-required': 'A streamable-http server needs an http:// or https:// URL.',
      'errors.sse-unsupported': 'The legacy SSE transport is not supported; use Streamable HTTP.',
      'errors.invalid-json': 'The JSON is not valid.',
      'errors.name-required': 'A standalone server object needs a name or serverName field.',
      'errors.invalid-server': 'The server configuration has the wrong shape.',
      'errors.not-found': 'No server named “{name}”.',
      'errors.inherited-readonly': 'A base-config server cannot be deleted; disable it instead.',
      'errors.manager-missing': 'No MCP manager is composed in this profile, so managed servers cannot be saved.',
      'errors.manager-disabled': 'The MCP manager is disabled, so managed servers cannot be saved.',
      'errors.manager-unavailable': 'The MCP manager is not ready yet; try again in a moment.',
      'errors.settings-missing': 'The settings service is not ready; the MCP configuration cannot be saved.',
      'errors.loader-unavailable': 'The plugin list could not be read.',
      'errors.disabled': 'This static MCP row is disabled; enable it before editing.',
      'errors.not-mcp-client': 'That plugin row is not an MCP client.',
      'errors.config-editor-missing': 'The config editor is unavailable; the static MCP row cannot be saved.',
      'errors.plugin-manager-missing': 'The plugin manager is unavailable; the static MCP row cannot be toggled.',
      'errors.server-required': 'The server configuration is missing.',
      'errors.json-name-mismatch': 'The JSON holds no configuration for this server.',
      'errors.empty': 'There is no server to add.',
      'errors.unknown-action': 'Unknown operation.',
      'errors.body-too-large': 'The request body is too large.',
      'errors.invalid-body': 'The request body is malformed.',
      'errors.SETTINGS_CONFLICT': 'The configuration changed in another page; refresh and try again.',
      'errors.invalid-preference': 'That preference value is invalid.',
      'errors.preferences-write-failed': 'The page preference could not be saved.',
      'errors.error': 'The operation failed; check the Host log.',
      'notice.saved': 'Saved',
      'notice.imported': 'Imported',
      'notice.refreshed': 'Refreshed',
      'notice.restartRequired': 'Saved; restart DSH to apply.',
      'notice.secrets': 'Environment values and headers are stored in the profile as plain text; keep secrets in ${credential:REF} templates so the credentials service resolves them.',
      'version.label': 'UI build 1.5',
      'shortcut.title': 'Sidebar shortcut',
      'shortcut.hint': 'Show an MCP icon in the DSH sidebar that opens this page.',
      'confirm.deleteTitle': 'Delete server',
      'confirm.deleteBody': 'Deleting “{name}” removes its tools from the agent immediately and drops the configuration from this profile.',
      'confirm.enableTitle': 'Enable static MCP row',
      'confirm.enableBody': 'Enabling “{name}” mounts the row and connects the server immediately. Continue?',
      'confirm.disableTitle': 'Disable static MCP row',
      'confirm.disableBody': 'Disabling “{name}” disconnects it and removes its tools immediately. The configuration stays in the profile. Continue?',
      'probe.running': 'Probing…',
      'probe.ok': 'Connected · {count} tools · {ms} ms',
      'probe.truncated': 'tool list truncated',
      'probe.failed': 'Failed at {stage}: {message} ({ms} ms)',
      'probe.stage.connect': 'connect',
      'probe.stage.list': 'list',
      'probe.cleanup': 'Close reported: {message}',
      'form.addTitle': 'Add MCP server',
      'form.editTitle': 'Edit {name}',
      'form.staticTitle': 'Edit static MCP row {name}',
      'form.lead': 'stdio servers start a local command; Streamable HTTP servers connect to a URL.',
      'form.tabForm': 'Form',
      'form.tabJson': 'JSON',
      'form.name': 'Name',
      'form.nameHint': 'Used in tool names as mcp__<name>__; letters, digits, underscore and hyphen only.',
      'form.transport': 'Transport',
      'form.command': 'Command',
      'form.commandHint': 'For example npx, uvx, or an absolute path to an executable.',
      'form.args': 'Arguments',
      'form.argsHint': 'One argument per line; no shell expansion.',
      'form.env': 'Environment',
      'form.envHint': 'One KEY=VALUE per line; values may use ${credential:REF} templates.',
      'form.cwd': 'Working directory',
      'form.cwdHint': 'Optional; empty uses the Harness process directory.',
      'form.url': 'Endpoint URL',
      'form.urlHint': 'Streamable HTTP endpoint, for example https://example.com/mcp.',
      'form.headers': 'Headers',
      'form.headersHint': 'One Key: Value per line; values may use ${credential:REF} templates.',
      'form.advanced': 'Advanced',
      'form.startup': 'Startup timeout (ms)',
      'form.call': 'Call timeout (ms)',
      'form.reconnect': 'Reconnect automatically',
      'form.failOnStartup': 'Fail the plugin row when startup fails',
      'form.jsonHint': 'Paste a Claude Desktop / Cursor mcpServers document, a DSH servers document, or one server object; several servers may be added at once.',
      'form.jsonEditHint': 'Only this server is updated: one server object is enough, keep the name “{name}”.',
      'form.jsonPlaceholder': '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n      "env": { "GITHUB_TOKEN": "..." }\n    }\n  }\n}',
      'form.requiredCommand': 'Enter a command.',
      'form.requiredUrl': 'Enter an http:// or https:// URL.',
      'form.badName': 'Invalid name: letters, digits, underscore or hyphen, 1–32 characters.',
      'form.nameTaken': 'That name is already taken.',
      'form.advancedHint': 'Leave a field empty to use the default.',
      'static.title': 'Statically composed',
      'static.lead': 'These servers are mounted by @deepseek-ai/dsh-mcp-client rows in the profile or a plugin patch. Enable, disable, edit or inspect them here; removing the row belongs in that patch.',
      'static.disabledHint': 'This row is disabled; enable it before editing its configuration.',
      'static.conflict': 'Shares a name with a managed server; they may not run together.',
      'static.empty': 'No statically composed MCP rows.',
      'static.phase': 'Plugin state: {phase}',
      'phase.pending': 'pending',
      'phase.loading': 'loading',
      'phase.active': 'active',
      'phase.failed': 'failed',
      'phase.unloading': 'unloading',
      'discover.title': 'Import from other apps on this machine',
      'discover.lead': 'Reads existing MCP configuration files without writing them; imported servers are then managed here.',
      'discover.empty': 'No servers found in the usual MCP configuration files on this machine.',
      'discover.import': 'Import',
      'discover.importing': 'Importing…',
      'discover.found': '{count} servers',
      'discover.fileError': 'Read failed: {message}',
      'discover.rowError': 'Cannot import: {message}',
      'discover.already': 'Already managed',
      'note.title': 'Where changes are saved',
      'note.body': 'Managed servers are written to this profile’s cordis.patch.yml through the settings service; static rows through the config editor and plugin manager. Every change affects only this profile.',
      'manager.missing': 'No MCP manager (@deepseek-ai/dsh-mcp-manager) is composed, so managed servers cannot be added.',
      'manager.disabled': 'The MCP manager is disabled; managed servers cannot be edited.',
      'manager.unavailable': 'The MCP manager is not ready yet; refresh in a moment.',
      'capability.unavailable': 'Static rows are read-only: the config editor or plugin manager is unavailable.',
      'warn.title': 'Notices',
      'env.title': 'Environment',
      'headers.title': 'Headers',
      'config.transport': 'Transport',
      'config.command': 'Command',
      'config.url': 'URL',
      'config.cwd': 'Working directory',
      'config.startup': 'Startup timeout',
      'config.call': 'Call timeout',
      'config.reconnect': 'Reconnect',
      'config.enabled': 'Enabled',
      'config.none': 'No extra configuration',
      'config.on': 'on',
      'config.off': 'off',
      copy: 'Copy',
      copied: 'Copied',
      'error.http': 'The Host answered {status}; the MCP manager backend may not be loaded yet.',
    }

    let translate = (key) => key
    let localeVersion = 0
    const localeWatchers = new Set()
    /** Assigned by apply; (un)registers the optional sidebar entry. */
    let applySidebarShortcut = () => {}

    function format(template, values) {
      if (!values) return template
      let text = template
      for (const [key, value] of Object.entries(values)) {
        text = text.split('{' + key + '}').join(String(value))
      }
      return text
    }

    function t(key, values) {
      return format(translate(key), values)
    }

    function useLocaleVersion() {
      const [, force] = useState(0)
      useEffect(() => {
        const update = () => { force((value) => value + 1) }
        localeWatchers.add(update)
        return () => { localeWatchers.delete(update) }
      }, [])
      // Read the counter so a locale change that happened before this mount still
      // renders through the bound translator.
      void localeVersion
    }

    // =========================================================================
    // Host API
    // =========================================================================

    async function readJson(response, fallbackStatus) {
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(t('error.http', { status: fallbackStatus ?? response.status }))
      }
      return data
    }

    async function loadState() {
      const response = await fetch(ROUTE, { headers: { accept: 'application/json' } })
      if (!response.ok) {
        const data = await response.json().catch(() => undefined)
        throw new Error(data?.error || t('error.http', { status: response.status }))
      }
      const data = await readJson(response)
      if (data?.ok !== true) throw new Error(data?.error || t('error.http', { status: response.status }))
      return data
    }

    async function callAction(action, payload) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload ?? {}) }),
      })
      const data = await readJson(response)
      if (data?.ok !== true) {
        const error = new Error(data?.error || t('error.http', { status: response.status }))
        error.code = data?.code
        error.details = data?.details
        throw error
      }
      return data
    }

    /**
     * A user-facing message for a failure. The Host answers every refusal with a
     * stable machine code, so the page speaks its active language instead of
     * echoing the Host's Chinese-only text; an unknown code keeps the diagnostic.
     */
    function errorText(failure) {
      const code = failure?.code
      if (typeof code === 'string') {
        const key = 'errors.' + code
        const template = translate(key)
        if (template !== key) {
          const name = failure?.details?.name
          return template.split('{name}').join(typeof name === 'string' && name !== '' ? name : '?')
        }
      }
      return failure?.message || String(failure)
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    function clock(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
      try {
        return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      } catch {
        return ''
      }
    }

    function splitLines(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }

    /** Parse `KEY=VALUE` lines (environment). */
    function parsePairs(text, separator) {
      const result = {}
      for (const line of splitLines(text)) {
        const index = line.indexOf(separator)
        if (index <= 0) continue
        const key = line.slice(0, index).trim()
        const value = line.slice(index + separator.length).trim()
        if (key !== '') result[key] = value
      }
      return result
    }

    function pairsText(map) {
      if (map === null || typeof map !== 'object') return ''
      return Object.entries(map).map(([key, value]) => `${key}=${value}`).join('\n')
    }

    function headersText(map) {
      if (map === null || typeof map !== 'object') return ''
      return Object.entries(map).map(([key, value]) => `${key}: ${value}`).join('\n')
    }

    function commandLine(server) {
      if (server.transport === 'stdio') {
        const args = Array.isArray(server.args) ? server.args : []
        return [server.command, ...args].filter(Boolean).join(' ')
      }
      return server.url || ''
    }

    function transportLabel(server) {
      return server.transport === 'streamable-http' || server.transport === 'http'
        ? t('transport.http')
        : t('transport.stdio')
    }

    function managerReasonKey(reason) {
      if (reason === 'manager-disabled') return 'manager.disabled'
      if (reason === 'settings-missing' || reason === 'descriptor-missing' || reason === 'manager-unavailable') {
        return 'manager.unavailable'
      }
      return 'manager.missing'
    }

    function statusView(server, isStatic) {
      if (isStatic) {
        if (server.enabled === false) return { tone: 'idle', label: t('status.disabled') }
        if (server.phase === 'failed') {
          return { tone: 'error', label: t('status.rowFailed'), detail: t('static.phase', { phase: t('phase.failed') }) }
        }
        if (server.tools.length > 0) return { tone: 'ok', label: t('status.connected', { count: server.tools.length }) }
        if (server.phase === 'active') return { tone: 'warn', label: t('status.noTools') }
        return { tone: 'idle', label: t('status.unknown'), detail: server.phase ? t('static.phase', { phase: t('phase.' + server.phase) }) : '' }
      }
      if (server.enabled === false) return { tone: 'idle', label: t('status.disabled') }
      const status = server.status
      if (status === null || typeof status !== 'object') return { tone: 'idle', label: t('status.unknown') }
      switch (status.state) {
        case 'connected':
          return {
            tone: 'ok',
            label: t('status.connected', { count: typeof status.toolCount === 'number' ? status.toolCount : server.tools.length }),
            detail: t('status.connectedAt', { time: clock(status.connectedAt) }),
          }
        case 'connecting':
          return { tone: 'warn', label: t('status.connecting') }
        case 'reconnecting':
          return {
            tone: 'warn',
            label: t('status.reconnecting', { attempt: status.attempt, max: status.maxAttempts }),
            detail: status.lastError,
          }
        case 'waiting-credentials':
          return { tone: 'warn', label: t('status.waiting'), detail: status.lastError }
        case 'failed':
          return { tone: 'error', label: t('status.failed'), detail: status.lastError || status.reason }
        case 'disabled':
          return { tone: 'idle', label: t('status.disabled') }
        case 'closed':
          return { tone: 'idle', label: t('status.closed') }
        default:
          return { tone: 'idle', label: t('status.unknown'), detail: status.state }
      }
    }

    function probeView(probe) {
      if (probe === null || typeof probe !== 'object') return null
      const duration = typeof probe.durationMs === 'number' ? probe.durationMs : 0
      const notes = []
      if (probe.ok === true) {
        const count = Array.isArray(probe.toolNames) ? probe.toolNames.length : 0
        let label = t('probe.ok', { count, ms: duration })
        if (probe.truncated === true) label += ' · ' + t('probe.truncated')
        if (probe.closeConfirmed === false) notes.push(t('probe.cleanup', { message: probe.cleanupError || 'unconfirmed' }))
        return { tone: 'ok', label, notes }
      }
      const stage = probe.stage === 'list' ? t('probe.stage.list') : t('probe.stage.connect')
      return { tone: 'error', label: t('probe.failed', { stage, message: probe.message || '', ms: duration }), notes }
    }

    // =========================================================================
    // Styles
    // =========================================================================

    const CSS = `
.mcp-manage {
  --mcp-manage-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--dsw-alias-label-primary, inherit);
  min-width: 0;
}
.mcp-manage * { box-sizing: border-box; }
.mcp-manage h3, .mcp-manage h4 { margin: 0; font-weight: 600; }
.mcp-manage p { margin: 0; }
.mcp-manage code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }

.mcp-manage-lead { color: var(--dsw-alias-label-secondary, inherit); max-width: 72ch; }

/* The global main panel reuses the same management surface. */
.mcp-manage-page {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  /* The host main-panel column already clears the window chrome; this is the
     page's own breathing room, matching other main-panel entries. */
  padding: 20px 28px 40px;
}
.mcp-manage-page-inner {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: min(100%, 1040px);
  margin: 0 auto;
}
.mcp-manage-page-head { display: flex; align-items: center; gap: 10px; }
.mcp-manage-page-glyph { display: inline-flex; color: var(--dsw-alias-state-business-primary, var(--dsw-static-blue-600, #2563eb)); }
.mcp-manage-page-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }

/* Page preference row: one switch, host row geometry. */
.mcp-manage-pref {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 11px 14px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.mcp-manage-pref-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.mcp-manage-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.mcp-manage-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.mcp-manage-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 9px; border-radius: 999px; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-secondary, inherit);
  white-space: nowrap;
}
.mcp-manage-chip[data-tone="ok"] { color: var(--dsw-alias-state-success-primary, #2f9e44); }
.mcp-manage-chip[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary, #b7791f); }
.mcp-manage-spacer { flex: 1 1 auto; }

.mcp-manage-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 30px; padding: 4px 11px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.38));
  background: transparent; color: inherit; font: inherit; font-size: 13px;
  cursor: pointer; white-space: nowrap;
  transition: background-color .12s ease, border-color .12s ease;
}
.mcp-manage-btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.mcp-manage-btn:active:not(:disabled) { background: color-mix(in srgb, currentColor 13%, transparent); }
.mcp-manage-btn:disabled { opacity: .5; cursor: default; }
.mcp-manage-btn[data-variant="primary"] {
  /* A filled action keeps the plugin's blue identity in both palettes. The
     palette's saturated blue is stable light/dark and takes white ink, while
     brand-primary is a near-white contrast fill in dark mode and would hide
     white text. The inline declarations set by Button are authoritative; these
     remain as the stylesheet fallback. */
  background: var(--dsw-static-blue-600, #2563eb) !important;
  border-color: transparent !important;
  color: var(--dsw-alias-label-on-color, #fff) !important;
}
.mcp-manage-btn[data-variant="primary"]:hover:not(:disabled) { filter: brightness(.9); }
.mcp-manage-btn[data-variant="primary"]:active:not(:disabled) { filter: brightness(.82); }
.mcp-manage-btn[data-variant="danger"] { color: var(--dsw-alias-state-error-primary, #c9342c); border-color: color-mix(in srgb, currentColor 45%, transparent); }
.mcp-manage-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
}
.mcp-manage-icon-btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--dsw-alias-label-primary, inherit); }
.mcp-manage-icon-btn:disabled { opacity: .4; cursor: default; }
.mcp-manage-icon-btn[data-tone="danger"]:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary, #c9342c); }

.mcp-manage :is(button, input, textarea, select, summary, a):focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, Highlight));
  outline-offset: 2px;
}

/* Summary cards */
.mcp-manage-list { display: flex; flex-direction: column; gap: 10px; }
.mcp-manage-card {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  transition: border-color .12s ease, background-color .12s ease;
}
.mcp-manage-card:hover { border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.45)); }
.mcp-manage-card-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; min-width: 0; }
.mcp-manage-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary, GrayText); }
.mcp-manage-dot[data-tone="ok"] { background: var(--dsw-alias-state-success-primary, #2f9e44); }
.mcp-manage-dot[data-tone="warn"] { background: var(--dsw-alias-state-warn-primary, #b7791f); animation: mcp-manage-pulse 1.4s ease-in-out infinite; }
.mcp-manage-dot[data-tone="error"] { background: var(--dsw-alias-state-error-primary, #c9342c); }
@keyframes mcp-manage-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .mcp-manage-dot[data-tone="warn"] { animation: none; } }
.mcp-manage-name { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13.5px; }
.mcp-manage-badge {
  display: inline-flex; align-items: center;
  padding: 0 6px; min-height: 18px; border-radius: 5px;
  font-size: 10.5px; letter-spacing: .04em;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3));
  color: var(--dsw-alias-label-secondary, inherit);
  background: color-mix(in srgb, currentColor 6%, transparent);
  white-space: nowrap;
}
.mcp-manage-badge[data-tone="brand"] { color: var(--dsw-alias-state-business-primary, #4176e6); border-color: color-mix(in srgb, currentColor 40%, transparent); }
.mcp-manage-badge[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary, #b7791f); border-color: color-mix(in srgb, currentColor 40%, transparent); }
.mcp-manage-status { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.mcp-manage-status[data-tone="ok"] { color: var(--dsw-alias-state-success-primary, #2f9e44); }
.mcp-manage-status[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary, #b7791f); }
.mcp-manage-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #c9342c); }
.mcp-manage-status-detail { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); opacity: .85; overflow-wrap: anywhere; word-break: break-word; }
.mcp-manage-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.mcp-manage-sub { display: flex; align-items: center; gap: 8px; min-width: 0; }
.mcp-manage-cmd {
  display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, inherit);
  background: color-mix(in srgb, currentColor 5%, transparent);
  padding: 2px 7px; border-radius: 6px; max-width: 100%;
}
.mcp-manage-probe { font-size: 12px; padding: 5px 9px; border-radius: 7px; background: color-mix(in srgb, currentColor 6%, transparent); overflow-wrap: anywhere; word-break: break-word; }
.mcp-manage-probe[data-tone="ok"] { color: var(--dsw-alias-state-success-primary, #2f9e44); }
.mcp-manage-probe[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #c9342c); }
.mcp-manage-probe[data-tone="running"] { color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-probe-warn { color: var(--dsw-alias-state-warn-primary, #b7791f); font-size: 11.5px; display: block; }
.mcp-manage-card-error {
  font-size: 12px; padding: 5px 9px; border-radius: 7px;
  color: var(--dsw-alias-state-error-primary, #c9342c);
  background: color-mix(in srgb, currentColor 8%, transparent);
  overflow-wrap: anywhere; word-break: break-word;
}

.mcp-manage-more { border-top: 1px dashed var(--dsw-alias-border-l1, rgba(128,128,128,.25)); padding-top: 7px; }
.mcp-manage-more > summary {
  display: inline-flex; align-items: center; gap: 5px;
  cursor: pointer; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px;
  list-style: none;
}
.mcp-manage-more > summary::-webkit-details-marker { display: none; }
.mcp-manage-more[open] > summary { margin-bottom: 8px; }
.mcp-manage-more-grid { display: grid; grid-template-columns: minmax(96px, max-content) minmax(0, 1fr); gap: 4px 14px; font-size: 12px; }
.mcp-manage-more-grid dt { color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-more-grid dd { margin: 0; min-width: 0; word-break: break-all; }
.mcp-manage-mono-block {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.5px;
  white-space: pre-wrap; word-break: break-all;
  background: color-mix(in srgb, currentColor 6%, transparent);
  border-radius: 6px; padding: 5px 7px;
}
.mcp-manage-tools { display: flex; flex-wrap: wrap; gap: 5px; }
.mcp-manage-tool {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px;
  padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3));
  color: var(--dsw-alias-label-secondary, inherit);
}
.mcp-manage-tool-more { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-empty-tools { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-note { font-size: 12px; color: var(--dsw-alias-state-warn-primary, #b7791f); }

.mcp-manage-switch { position: relative; display: inline-flex; flex: 0 0 36px; width: 36px; height: 20px; cursor: pointer; }
.mcp-manage-switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; }
.mcp-manage-switch-track {
  position: absolute; inset: 0; border-radius: 999px;
  background: var(--dsw-alias-border-l2, GrayText);
  transition: background-color .14s ease;
}
.mcp-manage-switch-track::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-bg-base, Canvas);
  transition: transform .14s ease;
}
.mcp-manage-switch input:checked + .mcp-manage-switch-track { background: var(--dsw-alias-state-business-primary, var(--dsw-static-blue-600, #2563eb)); }
.mcp-manage-switch input:checked + .mcp-manage-switch-track::after { transform: translateX(16px); }
.mcp-manage-switch input:disabled + .mcp-manage-switch-track { opacity: .5; }
.mcp-manage-switch input:focus-visible + .mcp-manage-switch-track { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, Highlight)); outline-offset: 2px; }

/* Sections */
.mcp-manage-section {
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  border-radius: 12px; padding: 12px 14px;
}
.mcp-manage-section > summary {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  cursor: pointer; list-style: none;
}
.mcp-manage-section > summary::-webkit-details-marker { display: none; }
.mcp-manage-section[open] > summary { margin-bottom: 10px; }
.mcp-manage-section-title { font-size: 14px; font-weight: 600; }
.mcp-manage-section-count { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-section-lead { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); margin-bottom: 10px; }
.mcp-manage-section-body { display: flex; flex-direction: column; gap: 8px; }
.mcp-manage-file { border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22)); border-radius: 9px; padding: 9px 11px; }
.mcp-manage-file-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-manage-file-path { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); word-break: break-all; flex: 1 1 100%; }
.mcp-manage-file-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 3px 0; }
.mcp-manage-file-row code { min-width: 0; }
.mcp-manage-file-error { font-size: 12px; color: var(--dsw-alias-state-error-primary, #c9342c); }
.mcp-manage-static-phase { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-warnings { font-size: 12px; color: var(--dsw-alias-state-warn-primary, #b7791f); display: flex; flex-direction: column; gap: 3px; }
.mcp-manage-error {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--dsw-alias-state-error-primary, #c9342c);
  background: color-mix(in srgb, currentColor 8%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 8px; padding: 7px 10px;
}
.mcp-manage-notice { font-size: 12px; color: var(--dsw-alias-state-success-primary, #2f9e44); }
.mcp-manage-footer-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-footer-note strong { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }

.mcp-manage-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 26px 18px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.4));
  border-radius: 12px;
  color: var(--dsw-alias-label-secondary, inherit);
}
.mcp-manage-empty strong { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }

/* Dialogs: a native modal dialog owns the top layer, so the settings panel's
   scroll container, transforms and stacking order cannot clip it. */
.mcp-manage-dialog {
  width: min(680px, calc(100vw - 40px));
  max-height: min(86vh, 820px);
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.45));
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, Canvas));
  color: var(--dsw-alias-label-primary, inherit);
  box-shadow: 0 24px 64px rgba(0,0,0,.38);
  overflow: hidden;
}
.mcp-manage-dialog[open] { display: flex; flex-direction: column; }
.mcp-manage-dialog[data-size="sm"] { width: min(440px, calc(100vw - 40px)); }
.mcp-manage-dialog::backdrop { background: rgba(0,0,0,.44); }
.mcp-manage-dialog-head, .mcp-manage-dialog-foot { flex: 0 0 auto; }
.mcp-manage-dialog-body { flex: 1 1 auto; }
.mcp-manage-dialog-head {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 16px 18px 10px;
}
.mcp-manage-dialog-heading { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mcp-manage-dialog-title { font-size: 15px; font-weight: 600; }
.mcp-manage-dialog-sub { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-dialog-body { padding: 4px 18px 14px; overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 13px; }
.mcp-manage-dialog-foot {
  display: flex; align-items: center; gap: 8px; justify-content: flex-end;
  padding: 11px 18px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #000) 3%, transparent);
}
.mcp-manage-tabs { display: inline-flex; gap: 3px; padding: 3px; border-radius: 9px; background: color-mix(in srgb, currentColor 7%, transparent); align-self: flex-start; }
.mcp-manage-tab {
  border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  font: inherit; font-size: 12.5px; padding: 4px 12px; cursor: pointer;
}
.mcp-manage-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-1, Canvas); color: var(--dsw-alias-label-primary, inherit); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.mcp-manage-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.mcp-manage-field-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mcp-manage-field-label { font-size: 12.5px; font-weight: 600; }
.mcp-manage-field-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-input, .mcp-manage-textarea, .mcp-manage-select {
  width: 100%; min-height: 32px; padding: 5px 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.45));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, Canvas);
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit; font-size: 13px;
}
.mcp-manage-textarea { min-height: 68px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.5; }
.mcp-manage-input:disabled, .mcp-manage-textarea:disabled, .mcp-manage-select:disabled { opacity: .6; }
.mcp-manage-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mcp-manage-segmented { display: inline-flex; gap: 4px; padding: 3px; border-radius: 9px; background: color-mix(in srgb, currentColor 7%, transparent); align-self: flex-start; }
.mcp-manage-segment {
  border: 1px solid transparent; border-radius: 7px; background: transparent;
  color: var(--dsw-alias-label-secondary, inherit); font: inherit; font-size: 12.5px;
  padding: 4px 14px; cursor: pointer;
}
.mcp-manage-segment[data-active="true"] {
  background: var(--dsw-alias-bg-layer-1, Canvas);
  border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.4));
  color: var(--dsw-alias-label-primary, inherit); font-weight: 600;
}
.mcp-manage-check { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; cursor: pointer; }
.mcp-manage-check input { width: 15px; height: 15px; accent-color: var(--dsw-alias-state-business-primary, #4176e6); }
.mcp-manage-advanced > summary { cursor: pointer; font-size: 12.5px; color: var(--dsw-alias-label-secondary, inherit); list-style: none; display: inline-flex; align-items: center; gap: 5px; }
.mcp-manage-advanced > summary::-webkit-details-marker { display: none; }
.mcp-manage-advanced[open] > summary { margin-bottom: 10px; }
.mcp-manage-advanced-body { display: flex; flex-direction: column; gap: 11px; }
.mcp-manage-form-error { font-size: 12.5px; color: var(--dsw-alias-state-error-primary, #c9342c); }
.mcp-manage-dialog-note { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }
.mcp-manage-confirm-body { font-size: 13px; color: var(--dsw-alias-label-secondary, inherit); }
`

    function installStyles() {
      if (typeof document === 'undefined') return
      const existing = document.getElementById('dsh-mcp-manage-styles')
      if (existing !== null) {
        // A plugin reload re-applies this module without reloading the page;
        // the old tag must receive the current rules instead of being reused.
        existing.textContent = CSS
        return
      }
      const tag = document.createElement('style')
      tag.id = 'dsh-mcp-manage-styles'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // =========================================================================
    // Primitives
    // =========================================================================

    const ICONS = {
      plus: 'M8 3.5v9M3.5 8h9',
      refresh: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.8M13.3 2.6v3h-3',
      pulse: 'M1.8 8h2.6l1.8-3.8L8.4 12l1.9-4h3.9',
      edit: 'M3 13l.7-2.9 6.8-6.8 2.2 2.2-6.8 6.8L3 13z',
      trash: 'M2.8 5h10.4M6 5V3.2h4V5M4.6 5l.8 8.2h4.7L11 5',
      chevron: 'M5.5 6.2 8 8.7l2.5-2.5',
      x: 'M4 4l8 8M12 4l-8 8',
      external: 'M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5',
    }

    function Icon({ name: iconName, size }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size ?? 14,
        height: size ?? 14,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, h('path', { d: ICONS[iconName] ?? '' }))
    }

    function Button({ children, icon, variant, onClick, disabled, title, type }) {
      // A host-wide button rule can outrank a class selector, so the two
      // call-to-action buttons pin their fill and ink as inline important
      // declarations — the only author level above every stylesheet selector.
      const pinPrimary = (element) => {
        if (variant !== 'primary' || element === null) return
        element.style.setProperty('background', 'var(--dsw-static-blue-600, #2563eb)', 'important')
        element.style.setProperty('color', 'var(--dsw-alias-label-on-color, #fff)', 'important')
        element.style.setProperty('border-color', 'transparent', 'important')
      }
      return h('button', {
        type: type ?? 'button',
        className: 'mcp-manage-btn',
        'data-variant': variant,
        onClick,
        disabled,
        title,
        ref: variant === 'primary' ? pinPrimary : undefined,
      }, icon ? h(Icon, { name: icon, size: 13 }) : null, children ? h('span', null, children) : null)
    }

    function IconButton({ icon, label, onClick, disabled, tone, title }) {
      return h('button', {
        type: 'button',
        className: 'mcp-manage-icon-btn',
        'data-tone': tone,
        'aria-label': label,
        title: title ?? label,
        onClick,
        disabled,
      }, h(Icon, { name: icon }))
    }

    function Badge({ children, tone }) {
      return h('span', { className: 'mcp-manage-badge', 'data-tone': tone }, children)
    }

    function Switch({ checked, onChange, disabled, label }) {
      return h('label', { className: 'mcp-manage-switch', title: label },
        h('input', {
          type: 'checkbox',
          role: 'switch',
          checked,
          disabled,
          'aria-label': label,
          onChange: (event) => onChange(event.target.checked),
        }),
        h('span', { className: 'mcp-manage-switch-track', 'aria-hidden': 'true' }))
    }

    function Field({ label, hint, children }) {
      const id = React.useId()
      const hintId = React.useId()
      const control = React.isValidElement(children)
        ? React.cloneElement(children, {
          id,
          'aria-describedby': hint ? hintId : undefined,
        })
        : children
      return h('div', { className: 'mcp-manage-field' },
        h('div', { className: 'mcp-manage-field-head' },
          h('label', { className: 'mcp-manage-field-label', htmlFor: id }, label),
          hint ? h('span', { className: 'mcp-manage-field-hint', id: hintId }, hint) : null),
        control)
    }

    function Modal({ title, subtitle, onClose, children, footer, size }) {
      const ref = useRef(null)
      const closeRef = useRef(onClose)
      closeRef.current = onClose
      useEffect(() => {
        const element = ref.current
        if (element === null) return undefined
        if (typeof element.showModal === 'function' && element.open !== true) {
          try { element.showModal() } catch { /* already open */ }
        }
        const onCancel = (event) => {
          event.preventDefault()
          closeRef.current()
        }
        element.addEventListener('cancel', onCancel)
        const target = element.querySelector('.mcp-manage-dialog-body input:not([type="checkbox"]):not([disabled]), .mcp-manage-dialog-body textarea:not([disabled]), .mcp-manage-dialog-body select:not([disabled])')
          ?? element.querySelector('.mcp-manage-dialog-foot button')
        if (target !== null && typeof target.focus === 'function') target.focus()
        return () => {
          element.removeEventListener('cancel', onCancel)
          if (element.open === true) element.close()
        }
      }, [])
      // A native modal dialog lives in the top layer: no ancestor transform,
      // overflow or z-index can clip it, and Escape/focus are the browser's.
      return h('dialog', {
        className: 'mcp-manage-dialog',
        'data-size': size,
        'aria-label': title,
        ref,
        onMouseDown: (event) => {
          if (event.target === ref.current) onClose()
        },
      }, [
        h('div', { key: 'head', className: 'mcp-manage-dialog-head' }, [
          h('div', { key: 'text', className: 'mcp-manage-dialog-heading' }, [
            h('span', { key: 'title', className: 'mcp-manage-dialog-title' }, title),
            subtitle ? h('span', { key: 'sub', className: 'mcp-manage-dialog-sub' }, subtitle) : null,
          ]),
          h('div', { key: 'spacer', style: { flex: '1 1 auto' } }),
          h(IconButton, { key: 'close', icon: 'x', label: t('action.close'), onClick: onClose }),
        ]),
        h('div', { key: 'body', className: 'mcp-manage-dialog-body' }, children),
        footer ? h('div', { key: 'foot', className: 'mcp-manage-dialog-foot' }, footer) : null,
      ])
    }

    // =========================================================================
    // Server dialog
    // =========================================================================

    function emptyForm() {
      return {
        name: '',
        transport: 'stdio',
        command: '',
        args: '',
        env: '',
        cwd: '',
        url: '',
        headers: '',
        startupTimeoutMs: '',
        toolCallTimeoutMs: '',
        closeTimeoutMs: '',
        reconnect: true,
        reconnectConfig: null,
        failOnStartupError: false,
      }
    }

    function formFromServer(server, staticMode) {
      const form = emptyForm()
      if (server === null || server === undefined) return form
      const config = server.config ?? server
      form.name = server.name ?? config.serverName ?? ''
      form.transport = config.transport === 'streamable-http' || config.transport === 'http' ? 'streamable-http' : 'stdio'
      form.command = config.command ?? ''
      form.args = Array.isArray(config.args) ? config.args.join('\n') : ''
      form.env = pairsText(config.env)
      form.cwd = config.cwd ?? ''
      form.url = config.url ?? ''
      form.headers = headersText(config.headers)
      form.startupTimeoutMs = typeof config.startupTimeoutMs === 'number' ? String(config.startupTimeoutMs) : ''
      form.toolCallTimeoutMs = typeof config.toolCallTimeoutMs === 'number' ? String(config.toolCallTimeoutMs) : ''
      form.closeTimeoutMs = typeof config.closeTimeoutMs === 'number' ? String(config.closeTimeoutMs) : ''
      form.reconnect = !(config.reconnect !== null && typeof config.reconnect === 'object' && config.reconnect.enabled === false)
      form.reconnectConfig = config.reconnect !== null && typeof config.reconnect === 'object' ? { ...config.reconnect } : null
      form.failOnStartupError = config.failOnStartupError === true
      void staticMode
      return form
    }

    function jsonFromServer(server) {
      if (server === null || server === undefined) return ''
      const source = server.config ?? server
      const config = {}
      for (const key of ['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs', 'reconnect', 'failOnStartupError']) {
        if (source[key] !== undefined) config[key] = source[key]
      }
      return JSON.stringify(config, null, 2)
    }

    function ServerDialog({ mode, initial, staticMode, knownNames, onClose, onSubmit }) {
      const [tab, setTab] = useState('form')
      const [form, setForm] = useState(() => formFromServer(initial, staticMode))
      const [json, setJson] = useState(() => (mode === 'edit' ? jsonFromServer(initial) : ''))
      const [error, setError] = useState('')
      const [submitting, setSubmitting] = useState(false)
      const t2 = t
      const isEdit = mode === 'edit'
      const title = staticMode && isEdit
        ? t2('form.staticTitle', { name: form.name || '' })
        : isEdit
          ? t2('form.editTitle', { name: form.name || '' })
          : t2('form.addTitle')

      const update = (key) => (event) => {
        const value = event?.target?.value ?? event
        setForm((current) => ({ ...current, [key]: value }))
      }

      function buildPayload() {
        if (tab === 'json') {
          if (json.trim() === '') throw new Error(t2('form.jsonRequired'))
          return { json }
        }
        const serverName = form.name.trim()
        if (!staticMode) {
          if (!NAME_PATTERN.test(serverName)) throw new Error(t2('form.badName'))
          if (!isEdit && knownNames.includes(serverName)) throw new Error(t2('form.nameTaken'))
        }
        const config = { transport: form.transport }
        if (form.transport === 'stdio') {
          const command = form.command.trim()
          if (command === '') throw new Error(t2('form.requiredCommand'))
          config.command = command
          const args = splitLines(form.args)
          if (args.length > 0) config.args = args
          const env = parsePairs(form.env, '=')
          if (Object.keys(env).length > 0) config.env = env
          const cwd = form.cwd.trim()
          if (cwd !== '') config.cwd = cwd
        } else {
          const url = form.url.trim()
          if (!/^https?:\/\/\S+$/i.test(url)) throw new Error(t2('form.requiredUrl'))
          config.url = url
          const headers = parsePairs(form.headers, ':')
          if (Object.keys(headers).length > 0) config.headers = headers
        }
        const startup = Number(form.startupTimeoutMs)
        if (Number.isFinite(startup) && startup > 0) config.startupTimeoutMs = Math.floor(startup)
        const call = Number(form.toolCallTimeoutMs)
        if (Number.isFinite(call) && call > 0) config.toolCallTimeoutMs = Math.floor(call)
        const close = Number(form.closeTimeoutMs)
        if (Number.isFinite(close) && close > 0) config.closeTimeoutMs = Math.floor(close)
        if (!staticMode) {
          const baseReconnect = form.reconnectConfig !== null && typeof form.reconnectConfig === 'object' ? form.reconnectConfig : {}
          config.reconnect = { ...baseReconnect, enabled: form.reconnect !== false }
        }
        if (staticMode) config.failOnStartupError = form.failOnStartupError === true
        return { name: staticMode ? initial?.name : serverName, server: config }
      }

      const submit = async () => {
        let payload
        try {
          payload = buildPayload()
        } catch (failure) {
          setError(failure.message)
          return
        }
        setSubmitting(true)
        setError('')
        try {
          await onSubmit(payload)
        } catch (failure) {
          setError(errorText(failure))
        } finally {
          setSubmitting(false)
        }
      }

      const transportToggle = h('div', { className: 'mcp-manage-segmented', role: 'group', 'aria-label': t2('form.transport') }, [
        h('button', {
          key: 'stdio',
          type: 'button',
          className: 'mcp-manage-segment',
          'data-active': String(form.transport === 'stdio'),
          'aria-pressed': form.transport === 'stdio',
          onClick: () => setForm((current) => ({ ...current, transport: 'stdio' })),
        }, 'stdio'),
        h('button', {
          key: 'http',
          type: 'button',
          className: 'mcp-manage-segment',
          'data-active': String(form.transport === 'streamable-http'),
          'aria-pressed': form.transport === 'streamable-http',
          onClick: () => setForm((current) => ({ ...current, transport: 'streamable-http' })),
        }, 'Streamable HTTP'),
      ])

      const formView = h('div', { key: 'form', style: { display: 'flex', flexDirection: 'column', gap: '13px' } }, [
        staticMode
          ? null
          : h(Field, {
            key: 'name',
            label: t2('form.name'),
            hint: t2('form.nameHint'),
          }, h('input', {
            className: 'mcp-manage-input',
            value: form.name,
            disabled: isEdit,
            spellCheck: false,
            placeholder: 'github',
            onChange: update('name'),
          })),
        h(Field, { key: 'transport', label: t2('form.transport') }, transportToggle),
        form.transport === 'stdio'
          ? h(Field, {
            key: 'command',
            label: t2('form.command'),
            hint: t2('form.commandHint'),
          }, h('input', {
            className: 'mcp-manage-input',
            value: form.command,
            spellCheck: false,
            placeholder: 'npx',
            onChange: update('command'),
          }))
          : h(Field, {
            key: 'url',
            label: t2('form.url'),
            hint: t2('form.urlHint'),
          }, h('input', {
            className: 'mcp-manage-input',
            value: form.url,
            spellCheck: false,
            placeholder: 'https://example.com/mcp',
            onChange: update('url'),
          })),
        form.transport === 'stdio'
          ? h(Field, {
            key: 'args',
            label: t2('form.args'),
            hint: t2('form.argsHint'),
          }, h('textarea', {
            className: 'mcp-manage-textarea',
            value: form.args,
            spellCheck: false,
            placeholder: '-y\n@modelcontextprotocol/server-github',
            onChange: update('args'),
          }))
          : h(Field, {
            key: 'headers',
            label: t2('form.headers'),
            hint: t2('form.headersHint'),
          }, h('textarea', {
            className: 'mcp-manage-textarea',
            value: form.headers,
            spellCheck: false,
            placeholder: 'Authorization: Bearer ${credential:MCP_TOKEN}',
            onChange: update('headers'),
          })),
        form.transport === 'stdio'
          ? h(Field, {
            key: 'env',
            label: t2('form.env'),
            hint: t2('form.envHint'),
          }, h('textarea', {
            className: 'mcp-manage-textarea',
            value: form.env,
            spellCheck: false,
            placeholder: 'GITHUB_TOKEN=${credential:GITHUB_TOKEN}',
            onChange: update('env'),
          }))
          : null,
        h('details', { key: 'advanced', className: 'mcp-manage-advanced' }, [
          h('summary', { key: 'summary' }, h(Icon, { name: 'chevron', size: 12 }), t2('form.advanced')),
          h('div', { key: 'body', className: 'mcp-manage-advanced-body' }, [
            form.transport === 'stdio'
              ? h(Field, {
                key: 'cwd',
                label: t2('form.cwd'),
                hint: t2('form.cwdHint'),
              }, h('input', {
                className: 'mcp-manage-input',
                value: form.cwd,
                spellCheck: false,
                placeholder: 'C:\\projects\\server',
                onChange: update('cwd'),
              }))
              : null,
            h('div', { key: 'numbers', className: 'mcp-manage-row2' }, [
              h(Field, { key: 'startup', label: t2('form.startup'), hint: t2('form.advancedHint') }, h('input', {
                className: 'mcp-manage-input',
                value: form.startupTimeoutMs,
                inputMode: 'numeric',
                placeholder: '30000',
                onChange: update('startupTimeoutMs'),
              })),
              h(Field, { key: 'call', label: t2('form.call'), hint: t2('form.advancedHint') }, h('input', {
                className: 'mcp-manage-input',
                value: form.toolCallTimeoutMs,
                inputMode: 'numeric',
                placeholder: '60000',
                onChange: update('toolCallTimeoutMs'),
              })),
            ]),
            h(Field, { key: 'close', label: t2('form.close'), hint: t2('form.advancedHint') }, h('input', {
              className: 'mcp-manage-input',
              value: form.closeTimeoutMs,
              inputMode: 'numeric',
              placeholder: '5000',
              onChange: update('closeTimeoutMs'),
            })),
            staticMode
              ? h('label', { key: 'fail', className: 'mcp-manage-check' }, h('input', {
                type: 'checkbox',
                checked: form.failOnStartupError === true,
                onChange: (event) => setForm((current) => ({ ...current, failOnStartupError: event.target.checked })),
              }), t2('form.failOnStartup'))
              : h('label', { key: 'reconnect', className: 'mcp-manage-check' }, h('input', {
                type: 'checkbox',
                checked: form.reconnect !== false,
                onChange: (event) => setForm((current) => ({ ...current, reconnect: event.target.checked })),
              }), t2('form.reconnect')),
          ]),
        ]),
      ])

      const jsonView = h('div', { key: 'json', style: { display: 'flex', flexDirection: 'column', gap: '8px' }, role: 'tabpanel' }, [
        h('p', { key: 'hint', className: 'mcp-manage-dialog-note' }, isEdit
          ? t2('form.jsonEditHint', { name: form.name || '' })
          : t2('form.jsonHint')),
        h('p', { key: 'replace', className: 'mcp-manage-dialog-note' }, isEdit ? t2('form.jsonReplace') : t2('form.jsonSingleName')),
        h('textarea', {
          key: 'area',
          className: 'mcp-manage-textarea',
          style: { minHeight: '240px' },
          value: json,
          spellCheck: false,
          'aria-label': t2('form.tabJson'),
          placeholder: t2('form.jsonPlaceholder'),
          onChange: (event) => setJson(event.target.value),
        }),
      ])

      return h(Modal, {
        title,
        subtitle: t2('form.lead'),
        onClose: submitting ? () => {} : onClose,
        footer: [
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'mcp-manage-btn',
            onClick: onClose,
            disabled: submitting,
          }, t2('action.cancel')),
          h(Button, {
            key: 'save',
            variant: 'primary',
            onClick: submit,
            disabled: submitting,
          }, submitting ? t2('action.saving') : t2('action.save')),
        ],
      }, [
        h('div', { key: 'tabs', className: 'mcp-manage-tabs', role: 'tablist', 'aria-label': t2('title') }, [
          h('button', {
            key: 'form',
            type: 'button',
            className: 'mcp-manage-tab',
            role: 'tab',
            'aria-selected': tab === 'form',
            'data-active': String(tab === 'form'),
            onClick: () => setTab('form'),
          }, t2('form.tabForm')),
          h('button', {
            key: 'json',
            type: 'button',
            className: 'mcp-manage-tab',
            role: 'tab',
            'aria-selected': tab === 'json',
            'data-active': String(tab === 'json'),
            onClick: () => setTab('json'),
          }, t2('form.tabJson')),
        ]),
        tab === 'form' ? formView : jsonView,
        error !== '' ? h('div', { key: 'error', className: 'mcp-manage-form-error', role: 'alert' }, error) : null,
      ])
    }

    // =========================================================================
    // Server rows
    // =========================================================================

    function ToolList({ tools }) {
      const [expanded, setExpanded] = useState(false)
      if (!Array.isArray(tools) || tools.length === 0) {
        return h('p', { className: 'mcp-manage-empty-tools' }, t('tools.none'))
      }
      const limit = expanded ? tools.length : Math.min(tools.length, 12)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
        h('div', { key: 'list', className: 'mcp-manage-tools' }, tools.slice(0, limit).map((tool) =>
          h('span', { key: tool, className: 'mcp-manage-tool', title: tool }, tool))),
        tools.length > limit
          ? h('button', {
            key: 'more',
            type: 'button',
            className: 'mcp-manage-btn',
            style: { alignSelf: 'flex-start', minHeight: '24px', padding: '1px 8px', fontSize: '11.5px' },
            onClick: () => setExpanded(true),
          }, t('tools.more', { count: tools.length - limit }))
          : null,
      ])
    }

    function DetailsGrid({ rows }) {
      const visible = rows.filter((row) => row !== null && row !== undefined)
      if (visible.length === 0) return h('p', { className: 'mcp-manage-empty-tools' }, t('config.none'))
      return h('dl', { className: 'mcp-manage-more-grid' }, visible.map((row, index) =>
        h(React.Fragment, { key: index }, h('dt', null, row[0]), h('dd', null, row[1]))))
    }

    function configRows(server) {
      const rows = []
      rows.push([t('config.transport'), server.transport === 'streamable-http' ? 'streamable-http' : 'stdio'])
      if (server.transport === 'stdio') {
        rows.push([t('config.command'), h('code', null, server.command || '—')])
        if (Array.isArray(server.args) && server.args.length > 0) rows.push([t('form.args'), h('span', { className: 'mcp-manage-mono-block' }, server.args.join('\n'))])
        if (server.cwd) rows.push([t('config.cwd'), h('code', null, server.cwd)])
        const envKeys = Object.keys(server.env ?? {})
        if (envKeys.length > 0) {
          rows.push([t('env.title'), h('span', { className: 'mcp-manage-mono-block' },
            envKeys.map((key) => `${key}=${server.env[key]}`).join('\n'))])
        }
      } else {
        rows.push([t('config.url'), h('code', null, server.url || '—')])
        const headerKeys = Object.keys(server.headers ?? {})
        if (headerKeys.length > 0) {
          rows.push([t('headers.title'), h('span', { className: 'mcp-manage-mono-block' },
            headerKeys.map((key) => `${key}: ${server.headers[key]}`).join('\n'))])
        }
      }
      if (server.startupTimeoutMs) rows.push([t('config.startup'), `${server.startupTimeoutMs} ms`])
      if (server.toolCallTimeoutMs) rows.push([t('config.call'), `${server.toolCallTimeoutMs} ms`])
      const reconnect = server.reconnect
      if (reconnect !== null && typeof reconnect === 'object') {
        rows.push([t('config.reconnect'), reconnect.enabled === false ? t('config.off') : t('config.on')])
      }
      return rows
    }

    function ManagedCard({ server, busy, enabledOverride, activeKind, error, probe, onToggle, onRestart, onProbe, onEdit, onDelete }) {
      const baseView = statusView(server, false)
      const view = activeKind === 'restart' ? { tone: 'warn', label: t('status.restarting') } : baseView
      const probeInfo = probe?.state === 'done' ? probeView(probe.result) : null
      const isBase = server.origin === 'base'
      const checked = enabledOverride === undefined ? server.enabled !== false : enabledOverride
      const actions = []
      actions.push(h(Switch, {
        key: 'switch',
        checked,
        disabled: busy,
        label: checked ? t('action.disable') : t('action.enable'),
        onChange: (value) => onToggle(value),
      }))
      actions.push(h(IconButton, {
        key: 'probe',
        icon: 'pulse',
        label: t('action.probe'),
        disabled: busy,
        onClick: () => onProbe(),
      }))
      actions.push(h(IconButton, {
        key: 'restart',
        icon: 'refresh',
        label: t('action.restart'),
        disabled: busy || server.enabled === false,
        onClick: () => onRestart(),
      }))
      actions.push(h(IconButton, {
        key: 'edit',
        icon: 'edit',
        label: t('action.edit'),
        disabled: busy,
        onClick: () => onEdit(),
      }))
      actions.push(h(IconButton, {
        key: 'delete',
        icon: 'trash',
        tone: 'danger',
        label: t('action.delete'),
        title: isBase ? t('action.deleteDisabled') : t('action.delete'),
        disabled: busy || isBase,
        onClick: () => onDelete(),
      }))

      return h('article', { className: 'mcp-manage-card', 'aria-busy': activeKind !== undefined }, [
        h('div', { key: 'head', className: 'mcp-manage-card-head' }, [
          h('span', { key: 'dot', className: 'mcp-manage-dot', 'data-tone': view.tone, 'aria-hidden': 'true' }),
          h('span', { key: 'name', className: 'mcp-manage-name' }, server.name),
          h(Badge, { key: 'transport' }, transportLabel(server)),
          isBase ? h(Badge, { key: 'origin', tone: 'brand' }, t('origin.base')) : null,
          server.origin === 'override' ? h(Badge, { key: 'override' }, t('origin.override')) : null,
          h('span', { key: 'status', className: 'mcp-manage-status', 'data-tone': view.tone, role: 'status' }, [
            h('span', { key: 'label' }, view.label),
            view.detail ? h('span', { key: 'detail', className: 'mcp-manage-status-detail' }, ' · ' + view.detail) : null,
          ]),
          h('div', { key: 'actions', className: 'mcp-manage-actions' }, actions),
        ]),
        h('div', { key: 'sub', className: 'mcp-manage-sub' },
          h('code', { className: 'mcp-manage-cmd', title: commandLine(server) }, commandLine(server) || '—')),
        isBase
          ? h('p', { key: 'base-hint', className: 'mcp-manage-footer-note' }, t('action.deleteDisabled'))
          : null,
        error !== undefined && error !== ''
          ? h('p', { key: 'error', className: 'mcp-manage-card-error', role: 'alert' }, error)
          : null,
        probe !== undefined && probe !== null
          ? h('div', {
            key: 'probe',
            className: 'mcp-manage-probe',
            'data-tone': probe.state === 'running' ? 'running' : (probeInfo?.tone ?? 'error'),
            role: 'status',
          }, [
            h('span', { key: 'label' }, probe.state === 'running' ? t('probe.running') : (probe.state === 'error' ? probe.error : probeInfo?.label)),
            ...(probeInfo?.notes ?? []).map((note, index) => h('span', { key: `note${index}`, className: 'mcp-manage-probe-warn' }, note)),
          ])
          : null,
        h('details', { key: 'more', className: 'mcp-manage-more' }, [
          h('summary', { key: 'summary' }, h(Icon, { name: 'chevron', size: 12 }), t('action.config')),
          h('div', { key: 'body', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
            h('div', { key: 'tools' }, [
              h('div', { key: 'title', className: 'mcp-manage-field-label', style: { marginBottom: '5px' } }, t('tools.title')),
              h(ToolList, { key: 'list', tools: server.tools }),
            ]),
            h(DetailsGrid, { key: 'grid', rows: configRows(server) }),
          ]),
        ]),
      ])
    }

    function StaticCard({ server, busy, canEdit, enabledOverride, activeKind, error, onToggle, onEdit }) {
      const view = statusView(server, true)
      const phaseText = server.phase ? t('phase.' + server.phase) : ''
      const checked = enabledOverride === undefined ? server.enabled !== false : enabledOverride
      const actions = [
        h(Switch, {
          key: 'switch',
          checked,
          disabled: busy || !canEdit,
          label: checked ? t('action.disable') : t('action.enable'),
          onChange: (value) => onToggle(value),
        }),
        h(IconButton, {
          key: 'edit',
          icon: 'edit',
          label: t('action.edit'),
          disabled: busy || !canEdit || server.enabled === false,
          onClick: () => onEdit(),
        }),
      ]
      return h('article', { className: 'mcp-manage-card', 'aria-busy': activeKind !== undefined }, [
        h('div', { key: 'head', className: 'mcp-manage-card-head' }, [
          h('span', { key: 'dot', className: 'mcp-manage-dot', 'data-tone': view.tone, 'aria-hidden': 'true' }),
          h('span', { key: 'name', className: 'mcp-manage-name' }, server.name || server.entryId),
          h(Badge, { key: 'transport' }, transportLabel(server)),
          h(Badge, { key: 'static', tone: 'brand' }, 'cordis'),
          h('span', { key: 'status', className: 'mcp-manage-status', 'data-tone': view.tone, role: 'status' }, [
            h('span', { key: 'label' }, view.label),
            phaseText ? h('span', { key: 'phase', className: 'mcp-manage-status-detail' }, ' · ' + t('static.phase', { phase: phaseText })) : null,
          ]),
          h('div', { key: 'actions', className: 'mcp-manage-actions' }, actions),
        ]),
        h('div', { key: 'sub', className: 'mcp-manage-sub' },
          h('code', { className: 'mcp-manage-cmd', title: commandLine(server) }, commandLine(server) || '—')),
        server.enabled === false
          ? h('p', { key: 'hint', className: 'mcp-manage-footer-note' }, t('static.disabledHint'))
          : null,
        server.conflict === true
          ? h('p', { key: 'conflict', className: 'mcp-manage-note' }, t('static.conflict'))
          : null,
        error !== undefined && error !== ''
          ? h('p', { key: 'error', className: 'mcp-manage-card-error', role: 'alert' }, error)
          : null,
        h('details', { key: 'more', className: 'mcp-manage-more' }, [
          h('summary', { key: 'summary' }, h(Icon, { name: 'chevron', size: 12 }), t('action.config')),
          h('div', { key: 'body', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
            h('div', { key: 'tools' }, [
              h('div', { key: 'title', className: 'mcp-manage-field-label', style: { marginBottom: '5px' } }, t('tools.title')),
              h(ToolList, { key: 'list', tools: server.tools }),
            ]),
            h(DetailsGrid, { key: 'grid', rows: configRows(server) }),
          ]),
        ]),
      ])
    }

    // =========================================================================
    // Sections
    // =========================================================================

    function DiscoverSection({ items, managedNames, busy, canManage, onImport, onScan }) {
      const total = items.reduce((count, item) => count + item.servers.length, 0)
      return h('details', { className: 'mcp-manage-section', open: false }, [
        h('summary', { key: 'summary' }, [
          h('span', { key: 'title', className: 'mcp-manage-section-title' }, t('discover.title')),
          h('span', { key: 'count', className: 'mcp-manage-section-count' }, total > 0 ? t('discover.found', { count: total }) : ''),
          h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
          h('button', {
            key: 'scan',
            type: 'button',
            className: 'mcp-manage-btn',
            style: { minHeight: '26px', padding: '1px 9px', fontSize: '12px' },
            disabled: busy,
            onClick: (event) => { event.preventDefault(); onScan() },
          }, t('scan')),
        ]),
        h('p', { key: 'lead', className: 'mcp-manage-section-lead' }, t('discover.lead')),
        items.length === 0
          ? h('p', { key: 'empty', className: 'mcp-manage-empty-tools' }, t('discover.empty'))
          : h('div', { key: 'files', className: 'mcp-manage-section-body' }, items.map((item) =>
            h('div', { key: item.id, className: 'mcp-manage-file' }, [
              h('div', { key: 'head', className: 'mcp-manage-file-head' }, [
                h('strong', { key: 'label', style: { fontSize: '13px' } }, item.label),
                h('span', { key: 'count', className: 'mcp-manage-section-count' }, t('discover.found', { count: item.servers.length })),
              ]),
              h('div', { key: 'path', className: 'mcp-manage-file-path' }, item.path),
              item.error
                ? h('p', { key: 'error', className: 'mcp-manage-file-error' }, t('discover.fileError', { message: item.error }))
                : null,
              ...item.servers.map((server) =>
                h('div', { key: server.name, className: 'mcp-manage-file-row' }, [
                  h('code', { key: 'name' }, server.name),
                  server.transport ? h(Badge, { key: 'transport' }, server.transport === 'streamable-http' ? t('transport.http') : t('transport.stdio')) : null,
                  server.error
                    ? h('span', { key: 'error', className: 'mcp-manage-file-error' }, t('discover.rowError', { message: server.error }))
                    : managedNames.includes(server.name)
                      ? h('span', { key: 'already', className: 'mcp-manage-section-count' }, t('discover.already'))
                      : h('button', {
                        key: 'import',
                        type: 'button',
                        className: 'mcp-manage-btn',
                        style: { minHeight: '24px', padding: '1px 9px', fontSize: '11.5px' },
                        disabled: busy || canManage !== true,
                        onClick: () => onImport(server),
                      }, t('discover.import')),
                ])),
            ])),
        ),
      ])
    }

    // =========================================================================
    // Main panel and sidebar entry
    // =========================================================================

    /** The compact sidebar glyph: the same hub mark, drawn in currentColor. */
    function HubGlyph({ size }) {
      const edge = size ?? 18
      return h('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 36 36',
        fill: 'none',
        'aria-hidden': 'true',
      }, [
        h('g', { key: 'spokes', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', opacity: 0.55 }, [
          h('path', { key: 'a', d: 'M15.1 15.1 9.4 9.4' }),
          h('path', { key: 'b', d: 'M21 14.6 25.4 10.2' }),
          h('path', { key: 'c', d: 'M18 21.4v5.4' }),
        ]),
        h('rect', { key: 'core', x: 12.6, y: 12.6, width: 10.8, height: 10.8, rx: 3.1, fill: 'currentColor' }),
        h('circle', { key: 'n1', cx: 7.6, cy: 7.6, r: 2.5, fill: 'currentColor' }),
        h('circle', { key: 'n2', cx: 27.8, cy: 8.6, r: 2.2, fill: 'currentColor' }),
        h('circle', { key: 'n3', cx: 18, cy: 29.4, r: 2.2, fill: 'currentColor' }),
      ])
    }

    /** The MCP manager as a global main panel, opened from the sidebar entry. */
    function HubPage() {
      useLocaleVersion()
      return h('div', { className: 'mcp-manage-page' },
        h('div', { className: 'mcp-manage-page-inner' }, [
          h('header', { key: 'head', className: 'mcp-manage-page-head' }, [
            h('span', { key: 'glyph', className: 'mcp-manage-page-glyph' }, h(HubGlyph, { size: 22 })),
            h('h1', { key: 'title', className: 'mcp-manage-page-title' }, t('title')),
          ]),
          h(SettingsRoot, { key: 'root' }),
        ]))
    }

    // =========================================================================
    // Root
    // =========================================================================

    function SettingsRoot() {
      useLocaleVersion()
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState(false)
      const [probes, setProbes] = useState({})
      const [active, setActive] = useState({})
      const [cardErrors, setCardErrors] = useState({})
      const [optimistic, setOptimistic] = useState({})
      const [dialog, setDialog] = useState(null)
      const live = useRef(true)
      const inflight = useRef(0)
      const noticeTimer = useRef(null)

      const flash = useCallback((message) => {
        setNotice(message)
        clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => { if (live.current) setNotice('') }, 2200)
      }, [])

      const clearProbe = useCallback((key) => {
        setProbes((current) => {
          if (current[key] === undefined) return current
          const next = { ...current }
          delete next[key]
          return next
        })
      }, [])

      const setCardError = useCallback((key, message) => {
        setCardErrors((current) => {
          const next = { ...current }
          if (message === undefined || message === '') delete next[key]
          else next[key] = message
          return next
        })
      }, [])

      const load = useCallback((options) => {
        if (options?.silent !== true) setError('')
        loadState().then((next) => {
          if (!live.current) return
          setState(next)
        }).catch((failure) => {
          if (!live.current || options?.silent === true) return
          setError(errorText(failure))
        })
      }, [])

      useEffect(() => {
        live.current = true
        load()
        const timer = setInterval(() => {
          if (!live.current || inflight.current > 0) return
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
          load({ silent: true })
        }, POLL_MS)
        return () => {
          live.current = false
          clearInterval(timer)
          clearTimeout(noticeTimer.current)
        }
      }, [load])

      const run = useCallback(async (action, payload, options) => {
        const card = options?.card
        const surface = options?.surface ?? (card === undefined ? 'page' : 'card')
        inflight.current += 1
        if (card !== undefined) {
          setActive((current) => ({ ...current, [card]: action }))
        } else {
          setBusy(true)
        }
        if (surface === 'page') setError('')
        try {
          const data = await callAction(action, payload)
          if (!live.current) return data
          if (data.state) setState(data.state)
          return data
        } catch (failure) {
          if (live.current && surface === 'page') setError(errorText(failure))
          throw failure
        } finally {
          inflight.current -= 1
          if (card !== undefined) {
            setActive((current) => {
              if (current[card] !== action) return current
              const next = { ...current }
              delete next[card]
              return next
            })
          } else if (live.current) {
            setBusy(false)
          }
        }
      }, [])

      const toggleManaged = useCallback(async (server, enabled) => {
        const key = server.name
        setOptimistic((current) => ({ ...current, [key]: enabled }))
        setCardError(key, '')
        try {
          await run('toggle', { name: key, enabled }, { card: key })
          clearProbe(key)
          flash(t('notice.saved'))
        } catch (failure) {
          setCardError(key, errorText(failure))
        } finally {
          setOptimistic((current) => {
            const next = { ...current }
            delete next[key]
            return next
          })
        }
      }, [run, flash, clearProbe, setCardError])

      const restartManaged = useCallback(async (server) => {
        const key = server.name
        setCardError(key, '')
        try {
          await run('restart', { name: key }, { card: key })
          clearProbe(key)
          flash(t('notice.saved'))
          setTimeout(() => { if (live.current) load({ silent: true }) }, 900)
        } catch (failure) {
          setCardError(key, errorText(failure))
        }
      }, [run, flash, load, clearProbe, setCardError])

      const probeManaged = useCallback(async (server) => {
        const key = server.name
        setProbes((current) => ({ ...current, [key]: { state: 'running' } }))
        inflight.current += 1
        setActive((current) => ({ ...current, [key]: 'probe' }))
        try {
          const data = await callAction('probe', { name: key })
          if (!live.current) return
          setProbes((current) => ({ ...current, [key]: { state: 'done', result: data.probe } }))
        } catch (failure) {
          if (live.current) {
            const result = failure?.message || String(failure)
            setProbes((current) => ({ ...current, [key]: { state: 'error', error: failure?.code ? errorText(failure) : result } }))
          }
        } finally {
          inflight.current -= 1
          if (live.current) {
            setActive((current) => {
              if (current[key] !== 'probe') return current
              const next = { ...current }
              delete next[key]
              return next
            })
          }
        }
      }, [])

      const openConfirm = useCallback((options) => { setDialog({ kind: 'confirm', ...options }) }, [])

      const submitServer = useCallback(async (payload) => {
        if (dialog === null) return
        if (dialog.kind === 'static') {
          await run('static-update', { entryId: dialog.entryId, ...(payload.json ? { json: payload.json } : { server: payload.server }) }, { surface: 'dialog' })
          if (dialog.initial?.name) clearProbe(dialog.initial.name)
          flash(t('notice.saved'))
          setDialog(null)
          return
        }
        if (dialog.mode === 'edit') {
          const key = dialog.initial.name
          await run('update', { name: key, ...(payload.json ? { json: payload.json } : { server: payload.server }) }, { surface: 'dialog' })
          clearProbe(key)
          setCardError(key, '')
          flash(t('notice.saved'))
          setDialog(null)
          return
        }
        const data = await run('create', payload.json ? { json: payload.json } : { name: payload.name, server: payload.server }, { surface: 'dialog' })
        for (const added of Array.isArray(data?.added) ? data.added : []) {
          clearProbe(added)
          setCardError(added, '')
        }
        flash(t('notice.saved'))
        if (Array.isArray(data?.added) && data.added.length > 1) flash(t('notice.imported'))
        setDialog(null)
      }, [dialog, run, flash, clearProbe, setCardError])

      const importServer = useCallback(async (server) => {
        try {
          await run('create', { servers: { [server.name]: server.config } }, { surface: 'page' })
          clearProbe(server.name)
          setCardError(server.name, '')
          flash(t('notice.imported'))
        } catch { /* shown by the page banner */ }
      }, [run, flash, clearProbe, setCardError])

      const setSidebarPreference = useCallback(async (enabled) => {
        const previous = state?.preferences?.sidebarShortcut === true
        writeLocalShortcut(enabled)
        applySidebarShortcut(enabled)
        try {
          await run('preferences', { sidebarShortcut: enabled }, { surface: 'page' })
          flash(t('notice.saved'))
        } catch {
          writeLocalShortcut(previous)
          applySidebarShortcut(previous)
          /* the page banner carries the failure */
        }
      }, [run, flash, state?.preferences?.sidebarShortcut])

      useEffect(() => {
        if (state === null) return
        applySidebarShortcut(state.preferences?.sidebarShortcut === true)
      }, [state?.preferences?.sidebarShortcut])

      const managedNames = state?.servers?.map((server) => server.name) ?? []

      const body = []

      if (state === null) {
        body.push(h('p', { key: 'loading', className: 'mcp-manage-lead', role: 'status' }, t('loading')))
        if (error !== '') {
          body.push(h('div', { key: 'error', className: 'mcp-manage-error' }, [
            h('span', { key: 'text' }, t('failed') + '：' + error),
            h('button', {
              key: 'retry',
              type: 'button',
              className: 'mcp-manage-btn',
              onClick: () => load(),
            }, t('retry')),
          ]))
        }
        return h('div', { className: 'mcp-manage' }, body)
      }

      const servers = state.servers ?? []
      const staticServers = state.staticServers ?? []
      const discovered = state.discovered ?? []
      const connected = servers.filter((server) => {
        const view = statusView(server, false)
        return view.tone === 'ok'
      }).length
      const disabled = servers.filter((server) => server.enabled === false).length
      const importable = discovered.reduce((count, item) => count + item.servers.filter((server) => !server.error && !managedNames.includes(server.name)).length, 0)
      const managed = state.manager ?? {}
      const capabilities = state.capabilities ?? {}

      const chips = [
        h('span', { key: 'all', className: 'mcp-manage-chip' }, t('summary.all', { count: servers.length })),
      ]
      if (connected > 0) chips.push(h('span', { key: 'connected', className: 'mcp-manage-chip', 'data-tone': 'ok' }, t('summary.connected', { count: connected })))
      if (disabled > 0) chips.push(h('span', { key: 'disabled', className: 'mcp-manage-chip' }, t('summary.disabled', { count: disabled })))
      if (staticServers.length > 0) chips.push(h('span', { key: 'static', className: 'mcp-manage-chip' }, t('summary.static', { count: staticServers.length })))
      if (importable > 0) chips.push(h('span', { key: 'found', className: 'mcp-manage-chip', 'data-tone': 'warn' }, t('summary.found', { count: importable })))

      body.push(h('p', { key: 'lead', className: 'mcp-manage-lead' }, [
        h('span', { key: 'text' }, t('lead')),
        h('span', { key: 'version', style: { opacity: 0.55, marginLeft: '8px', fontSize: '11.5px' } }, '· ' + t('version.label')),
      ]))

      body.push(h('div', { key: 'toolbar', className: 'mcp-manage-toolbar' }, [
        h('div', { key: 'chips', className: 'mcp-manage-chips' }, chips),
        h('span', { key: 'spacer', className: 'mcp-manage-spacer' }),
        h('button', {
          key: 'refresh',
          type: 'button',
          className: 'mcp-manage-btn',
          disabled: busy,
          onClick: () => { load(); flash(t('notice.refreshed')) },
        }, h(Icon, { name: 'refresh', size: 13 }), h('span', null, t('refresh'))),
        h(Button, {
          key: 'add',
          variant: 'primary',
          icon: 'plus',
          disabled: busy || capabilities.managed !== true,
          title: capabilities.managed === true ? undefined : t(managerReasonKey(managed.reason)),
          onClick: () => setDialog({ kind: 'server', mode: 'create' }),
        }, t('add')),
      ]))

      body.push(h('div', { key: 'shortcut', className: 'mcp-manage-pref' }, [
        h('div', { key: 'text', className: 'mcp-manage-pref-text' }, [
          h('span', { key: 'title', className: 'mcp-manage-field-label' }, t('shortcut.title')),
          h('span', { key: 'hint', className: 'mcp-manage-field-hint' }, t('shortcut.hint')),
        ]),
        h(Switch, {
          key: 'switch',
          checked: state.preferences?.sidebarShortcut === true,
          disabled: busy,
          label: t('shortcut.title'),
          onChange: (value) => { void setSidebarPreference(value) },
        }),
      ]))

      if (error !== '') {
        body.push(h('div', { key: 'error', className: 'mcp-manage-error', role: 'alert' }, [
          h('span', { key: 'text' }, t('failed') + '：' + error),
          h('button', { key: 'retry', type: 'button', className: 'mcp-manage-btn', onClick: () => load() }, t('refresh')),
        ]))
      }
      if (notice !== '') body.push(h('div', { key: 'notice', className: 'mcp-manage-notice', role: 'status' }, notice))

      if (capabilities.managed !== true) {
        body.push(h('div', { key: 'manager', className: 'mcp-manage-note' }, t(managerReasonKey(managed.reason))))
      }

      if (servers.length === 0) {
        body.push(h('div', { key: 'empty', className: 'mcp-manage-empty' }, [
          h('strong', { key: 'title' }, t('empty.title')),
          h('span', { key: 'hint' }, t('empty.hint')),
          capabilities.managed === true
            ? h(Button, { key: 'add', variant: 'primary', icon: 'plus', onClick: () => setDialog({ kind: 'server', mode: 'create' }) }, t('add'))
            : null,
        ]))
      } else {
        body.push(h('div', { key: 'list', className: 'mcp-manage-list' }, servers.map((server) =>
          h(ManagedCard, {
            key: server.name,
            server,
            busy: busy || active[server.name] !== undefined,
            activeKind: active[server.name],
            enabledOverride: optimistic[server.name],
            error: cardErrors[server.name],
            probe: probes[server.name],
            onToggle: (enabled) => { void toggleManaged(server, enabled) },
            onRestart: () => { void restartManaged(server) },
            onProbe: () => { void probeManaged(server) },
            onEdit: () => setDialog({ kind: 'server', mode: 'edit', initial: server }),
            onDelete: () => openConfirm({
              title: t('confirm.deleteTitle'),
              body: t('confirm.deleteBody', { name: server.name }),
              danger: true,
              confirmLabel: t('action.delete'),
              onConfirm: async () => {
                await run('remove', { name: server.name }, { surface: 'dialog' })
                clearProbe(server.name)
                setCardError(server.name, '')
                flash(t('notice.saved'))
                setDialog(null)
              },
            }),
          }))))
      }

      if (staticServers.length > 0) {
        body.push(h('details', { key: 'static', className: 'mcp-manage-section' }, [
          h('summary', { key: 'summary' }, [
            h('span', { key: 'title', className: 'mcp-manage-section-title' }, t('static.title')),
            h('span', { key: 'count', className: 'mcp-manage-section-count' }, String(staticServers.length)),
          ]),
          h('p', { key: 'lead', className: 'mcp-manage-section-lead' }, t('static.lead')),
          capabilities.staticEditable === true
            ? null
            : h('p', { key: 'capability', className: 'mcp-manage-note' }, t('capability.unavailable')),
          h('div', { key: 'list', className: 'mcp-manage-list' }, staticServers.map((server) =>
            h(StaticCard, {
              key: server.entryId,
              server,
              busy: busy || active[server.entryId] !== undefined,
              activeKind: active[server.entryId],
              enabledOverride: optimistic[server.entryId],
              error: cardErrors[server.entryId],
              canEdit: capabilities.staticEditable === true,
              onToggle: (enabled) => openConfirm({
                title: enabled ? t('confirm.enableTitle') : t('confirm.disableTitle'),
                body: t(enabled ? 'confirm.enableBody' : 'confirm.disableBody', { name: server.name || server.entryId }),
                danger: !enabled,
                confirmLabel: enabled ? t('action.enable') : t('action.disable'),
                onConfirm: async () => {
                  setOptimistic((current) => ({ ...current, [server.entryId]: enabled }))
                  try {
                    const data = await run('static-toggle', { entryId: server.entryId, enabled }, { surface: 'dialog' })
                    setCardError(server.entryId, '')
                    const application = data?.change?.application
                    if (typeof application === 'string' && application !== 'applied') flash(t('notice.restartRequired'))
                    else flash(t('notice.saved'))
                    setDialog(null)
                  } finally {
                    setOptimistic((current) => {
                      const next = { ...current }
                      delete next[server.entryId]
                      return next
                    })
                  }
                },
              }),
              onEdit: () => setDialog({ kind: 'static', entryId: server.entryId, initial: server }),
            }))),
        ]))
      } else {
        body.push(h('details', { key: 'static', className: 'mcp-manage-section' }, [
          h('summary', { key: 'summary' }, h('span', { key: 'title', className: 'mcp-manage-section-title' }, t('static.title'))),
          h('p', { key: 'empty', className: 'mcp-manage-empty-tools' }, t('static.empty')),
        ]))
      }

      body.push(h(DiscoverSection, {
        key: 'discover',
        items: discovered,
        managedNames,
        busy,
        canManage: capabilities.managed === true,
        onImport: (server) => { void importServer(server) },
        onScan: () => { void run('refresh', {}).then(() => flash(t('notice.refreshed'))).catch(() => {}) },
      }))

      if (Array.isArray(state.warnings) && state.warnings.length > 0) {
        body.push(h('div', { key: 'warnings', className: 'mcp-manage-warnings' }, [
          h('span', { key: 'title', style: { fontWeight: 600 } }, t('warn.title')),
          ...state.warnings.map((warning, index) => h('span', { key: index }, warning)),
        ]))
      }

      body.push(h('div', { key: 'note', className: 'mcp-manage-footer-note' }, [
        h('div', { key: 'where' }, [
          h('strong', { key: 'title' }, t('note.title') + '：'),
          h('span', { key: 'text' }, t('note.body')),
        ]),
        h('div', { key: 'secrets' }, t('notice.secrets')),
      ]))

      const overlay = []
      if (dialog !== null && (dialog.kind === 'server' || dialog.kind === 'static')) {
        overlay.push(h(ServerDialog, {
          key: 'server-dialog',
          mode: dialog.kind === 'static' ? 'edit' : dialog.mode,
          initial: dialog.initial ?? null,
          staticMode: dialog.kind === 'static',
          knownNames: managedNames,
          onClose: () => setDialog(null),
          onSubmit: submitServer,
        }))
      }
      if (dialog !== null && dialog.kind === 'confirm') {
        overlay.push(h(ConfirmDialog, {
          key: 'confirm-dialog',
          title: dialog.title,
          body: dialog.body,
          danger: dialog.danger,
          confirmLabel: dialog.confirmLabel,
          busy,
          onClose: () => setDialog(null),
          onConfirm: dialog.onConfirm,
        }))
      }

      return h('div', { className: 'mcp-manage' }, [...body, ...overlay])
    }

    function ConfirmDialog({ title, body, danger, confirmLabel, busy, onClose, onConfirm }) {
      const [error, setError] = useState('')
      const [working, setWorking] = useState(false)
      const confirm = async () => {
        setWorking(true)
        setError('')
        try {
          await onConfirm()
        } catch (failure) {
          setError(errorText(failure))
        } finally {
          setWorking(false)
        }
      }
      const disabled = working || busy
      return h(Modal, {
        title,
        size: 'sm',
        onClose: () => { if (!working) onClose() },
        footer: [
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'mcp-manage-btn',
            disabled,
            onClick: onClose,
          }, t('action.cancel')),
          h('button', {
            key: 'confirm',
            type: 'button',
            className: 'mcp-manage-btn',
            'data-variant': danger ? 'danger' : 'primary',
            disabled,
            onClick: confirm,
          }, confirmLabel),
        ],
      }, [
        h('p', { key: 'body', className: 'mcp-manage-confirm-body' }, body),
        error !== '' ? h('div', { key: 'error', className: 'mcp-manage-form-error', role: 'alert' }, error) : null,
      ])
    }

    // =========================================================================
    // Plugin
    // =========================================================================

    function apply(ctx) {
      installStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mcp-manage: dictionary')
      translate = ctx.locale.bind(NS)
      const bump = () => {
        localeVersion += 1
        translate = ctx.locale.bind(NS)
        for (const update of localeWatchers) update()
      }
      if (typeof ctx.locale.subscribe === 'function') {
        ctx.effect(() => {
          const off = ctx.locale.subscribe(bump)
          return () => { if (typeof off === 'function') off() }
        }, 'dsh-mcp-manage: locale changes')
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp-manage',
        order: 30,
        label: () => translate('nav'),
        locale: NS,
      }, SettingsRoot))

      // The global panel is always composed; the sidebar entry that opens it
      // is the preference the user controls from the page.
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'mcp-manage' }, HubPage))

      let launcherDispose = null
      let launcherOn = false
      const setLauncher = (on) => {
        const next = on === true
        if (next === launcherOn) return
        launcherOn = next
        if (next) {
          launcherDispose = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'mcp-manage',
            order: 25,
            label: () => translate('nav'),
            locale: NS,
          }, HubGlyph))
        } else if (launcherDispose !== null) {
          launcherDispose()
          launcherDispose = null
        }
      }
      applySidebarShortcut = setLauncher
      let shortcutAlive = true
      ctx.effect(() => () => {
        shortcutAlive = false
        applySidebarShortcut = () => {}
        if (launcherDispose !== null) {
          launcherDispose()
          launcherDispose = null
        }
        launcherOn = false
      }, 'dsh-mcp-manage: sidebar shortcut lifetime')
      // Register synchronously from the last browser-local choice, then
      // reconcile with the Host preference. The Host can still be starting
      // when a client row materializes, so the read retries for a moment.
      setLauncher(readLocalShortcut())
      const syncShortcut = (attempt) => {
        if (!shortcutAlive) return
        loadState().then((snapshot) => {
          if (!shortcutAlive) return
          const on = snapshot.preferences?.sidebarShortcut === true
          writeLocalShortcut(on)
          setLauncher(on)
        }).catch(() => {
          if (shortcutAlive && attempt < 6 && typeof window !== 'undefined') {
            setTimeout(() => { syncShortcut(attempt + 1) }, 500)
          }
        })
      }
      syncShortcut(0)
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    // Test seam: the page's own harness renders these without a browser.
    exports.__parts = { SettingsRoot, ServerDialog, ManagedCard, StaticCard, DiscoverSection, ConfirmDialog, Field, HubPage, HubGlyph, setSidebarShortcut: (on) => applySidebarShortcut(on) }
    return module.exports
  },
})
