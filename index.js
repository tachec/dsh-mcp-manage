/**
 * MCP hub — Host half.
 *
 * One authenticated same-origin JSON endpoint that the settings page drives:
 *
 *   GET  /dsh-mcp-hub/api   → the complete management snapshot
 *   POST /dsh-mcp-hub/api   → { action, ... } and the snapshot after the change
 *
 * Managed servers live in `@deepseek-ai/dsh-mcp-manager`'s volatile
 * `config.servers`; writes go through the settings service, so they are
 * validated, persisted by the profile's config editor, and reconciled into
 * live mcp-client instances without restarting the Host. Statically composed
 * `@deepseek-ai/dsh-mcp-client` rows are listed too: their configuration is
 * edited through the config editor and their enablement through the plugin
 * manager. MCP configuration files from other agent tools on this machine are
 * read, never written.
 *
 * No model-facing tool is registered: the page is the only caller.
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ROUTE = '/dsh-mcp-hub/api'
const MANAGER_PKG = '@deepseek-ai/dsh-mcp-manager'
const CLIENT_PKG = '@deepseek-ai/dsh-mcp-client'
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/
const MAX_BODY_BYTES = 256 * 1024
const MAX_CONFIG_BYTES = 2 * 1024 * 1024
const DISCOVERY_TTL_MS = 15_000
const PROBE_TIMEOUT_MS = 20_000

const MANAGER_FIELDS = [
  'transport', 'command', 'args', 'env', 'cwd', 'url', 'headers',
  'enabled', 'toolCallTimeoutMs', 'startupTimeoutMs', 'closeTimeoutMs', 'reconnect',
]

/** The last discovery scan, reused for a few seconds across page refreshes. */
let discoveryCache = { at: 0, value: [] }

/** Page preferences owned by this plugin, not by any MCP server. */
const DEFAULT_PREFERENCES = { sidebarShortcut: true }
let preferencesCache = null
let preferencesChain = Promise.resolve()

/** The preference document, beside the plugin's data under the Harness home. */
function preferencesFile() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'dsh-mcp-hub', 'preferences.json')
}

/** Read the preference document once, tolerating a missing or broken file. */
async function readPreferences() {
  if (preferencesCache !== null) return preferencesCache
  try {
    const text = await readFile(preferencesFile(), 'utf8')
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
    const sidebarShortcut = parsed !== null && typeof parsed === 'object' && parsed.sidebarShortcut === false ? false : true
    preferencesCache = { ...DEFAULT_PREFERENCES, sidebarShortcut }
  } catch {
    preferencesCache = { ...DEFAULT_PREFERENCES }
  }
  return preferencesCache
}

/** Persist one preference, serialized with later writes. */
async function writePreferences(patch) {
  const current = await readPreferences()
  const next = { ...current, ...patch }
  const previous = preferencesCache
  preferencesCache = next
  const run = async () => {
    const file = preferencesFile()
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, file)
  }
  const task = preferencesChain.then(run, run)
  preferencesChain = task.catch(() => {})
  try {
    await task
  } catch (error) {
    preferencesCache = previous
    throw fail('preferences-write-failed', `保存页面偏好失败：${messageOf(error)}`)
  }
  return next
}

/** Create a refusal that the browser renders as a message instead of a crash. */
function fail(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

/** Exact diagnostic text for a failure of unknown type. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** A deep, JSON-shaped copy: server configuration is plain data only. */
function plain(value) {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

/** Send one JSON response; never writes over a response the auth layer already finished. */
function sendJson(response, status, value) {
  if (response.headersSent || response.writableEnded) return
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.end(body)
}

/** Read a bounded JSON request body. */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw fail('body-too-large', '请求体过大。')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  let text = Buffer.concat(chunks).toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw fail('invalid-body', '请求体必须是一个 JSON 对象。')
    }
    return parsed
  } catch (error) {
    if (error.code === 'invalid-body') throw error
    throw fail('invalid-body', `请求体不是合法 JSON：${messageOf(error)}`)
  }
}

/** The shell's own document origins; a shell may mint a document on one of these. */
const APP_SCHEMES = ['dsh-app:', 'dsh-desktop:']

function schemeOf(value) {
  if (value === '' || value === 'null') return undefined
  try {
    return new URL(value).protocol
  } catch {
    return undefined
  }
}

/**
 * A second, browser-side boundary for writes. The host credential already
 * authenticated the request; this refuses a document on another origin.
 */
function sameOrigin(request, writing) {
  const origin = String(request.headers.origin ?? '').trim()
  const site = String(request.headers['sec-fetch-site'] ?? '').toLowerCase()
  if (APP_SCHEMES.includes(schemeOf(origin) ?? '')) return true
  if (APP_SCHEMES.includes(schemeOf(String(request.headers.referer ?? '')) ?? '')) return true
  if (origin === '') {
    const agent = String(request.headers['user-agent'] ?? '')
    const language = String(request.headers['accept-language'] ?? '')
    if (/^Mozilla\/5\.0/.test(agent) && language !== '') return true
    return !writing
  }
  if (site === 'cross-site' || site === 'same-site') return false
  if (origin === 'null') return false
  try {
    return new URL(origin).host.toLowerCase() === String(request.headers.host ?? '').trim().toLowerCase()
  } catch {
    return false
  }
}

/** Bind the host's signed browser-session authentication to this route. */
function authorized(ctx, request, response) {
  let connection
  try {
    connection = ctx.get('connection')
  } catch {
    connection = undefined
  }
  if (connection === undefined || typeof connection.authorizeIndex !== 'function') {
    sendJson(response, 503, { ok: false, error: 'host-auth-unavailable' })
    return false
  }
  return connection.authorizeIndex(request, response) !== false
}

/** Read a string field, falling back when the value is not a string. */
function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/** Read a positive millisecond budget; undefined when absent or unusable. */
function positiveNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0) {
    return Math.floor(Number(value))
  }
  return undefined
}

/** Read a string array, accepting a JSON string array for pasted configuration. */
function stringArray(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(item => (typeof item === 'string' ? item : String(item ?? '')))
  if (typeof value === 'string' && value.trim() !== '') return [value]
  return []
}

/** Read a `Record<string, string>` from an object of scalar values. */
function stringMap(value) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue
    if (typeof item === 'object') continue
    result[key] = String(item)
  }
  return result
}

/** Read the reconnect policy, keeping only declared members. */
function reconnectOf(value) {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  if (typeof value.enabled === 'boolean') out.enabled = value.enabled
  for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
    const number = positiveNumber(value[key])
    if (number !== undefined) out[key] = number
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** The transport an entry asks for; `type` is accepted for pasted third-party JSON. */
function transportOf(input) {
  if (input === null || typeof input !== 'object') return ''
  let transport = String(input.transport ?? input.type ?? '').trim().toLowerCase()
  if (transport === 'http') transport = 'streamable-http'
  if (transport === 'sse') {
    throw fail('sse-unsupported', '不支持旧的 SSE 传输；请使用 Streamable HTTP（把 type 改为 streamable-http 或 http）。')
  }
  if (transport === '') {
    if (typeof input.url === 'string' && input.url.trim() !== '') transport = 'streamable-http'
    else if (typeof input.command === 'string' && input.command.trim() !== '') transport = 'stdio'
  }
  return transport
}

/** Refuse a server name the manager or the tool namespace cannot carry. */
function assertServerName(name) {
  if (typeof name !== 'string' || !SERVER_NAME.test(name)) {
    throw fail('invalid-name', `服务器名 “${String(name)}” 不合法：只能使用字母、数字、下划线或连字符，长度 1–32。`, { name: String(name) })
  }
  return name
}

/**
 * Validate and normalize one managed server entry. Only manager fields are
 * kept; the per-transport rules mirror the manager's own write-time refusal so
 * a mistake is named before the write.
 */
function normalizeManagerEntry(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw fail('invalid-server', '服务器配置必须是一个 JSON 对象。')
  }
  const transport = transportOf(input)
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw fail('transport-required', '请选择传输方式：stdio 或 streamable-http。')
  }
  const out = { transport }
  if (transport === 'stdio') {
    const command = str(input.command).trim()
    if (command === '') throw fail('command-required', 'stdio 服务器必须填写启动命令（command）。')
    out.command = command
    const args = stringArray(input.args)
    if (args.length > 0) out.args = args
    const env = stringMap(input.env)
    if (Object.keys(env).length > 0) out.env = env
    const cwd = str(input.cwd).trim()
    if (cwd !== '') out.cwd = cwd
  } else {
    const url = str(input.url).trim()
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw fail('url-required', 'streamable-http 服务器必须填写以 http:// 或 https:// 开头的 URL。')
    }
    out.url = url
    const headers = stringMap(input.headers)
    if (Object.keys(headers).length > 0) out.headers = headers
  }
  const toolCallTimeoutMs = positiveNumber(input.toolCallTimeoutMs)
  if (toolCallTimeoutMs !== undefined) out.toolCallTimeoutMs = toolCallTimeoutMs
  const startupTimeoutMs = positiveNumber(input.startupTimeoutMs)
  if (startupTimeoutMs !== undefined) out.startupTimeoutMs = startupTimeoutMs
  const closeTimeoutMs = positiveNumber(input.closeTimeoutMs)
  if (closeTimeoutMs !== undefined) out.closeTimeoutMs = closeTimeoutMs
  const reconnect = reconnectOf(input.reconnect)
  if (reconnect !== undefined) out.reconnect = reconnect
  if (input.enabled === false || input.disabled === true) out.enabled = false
  return out
}

/** Keep only manager fields, so a pasted or copied document cannot smuggle junk into the profile. */
function cleanManagerConfig(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const out = {}
  for (const key of MANAGER_FIELDS) {
    if (source[key] !== undefined) out[key] = plain(source[key])
  }
  if (out.transport !== 'stdio' && out.transport !== 'streamable-http') {
    throw fail('invalid-server', '服务器配置缺少 transport。')
  }
  return out
}

/** A display summary plus the effective configuration the editor prefills. */
function summarizeServer(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  return {
    transport: str(source.transport),
    command: str(source.command),
    args: stringArray(source.args),
    cwd: str(source.cwd),
    env: stringMap(source.env),
    url: str(source.url),
    headers: stringMap(source.headers),
    toolCallTimeoutMs: positiveNumber(source.toolCallTimeoutMs),
    startupTimeoutMs: positiveNumber(source.startupTimeoutMs),
    closeTimeoutMs: positiveNumber(source.closeTimeoutMs),
    reconnect: reconnectOf(source.reconnect),
    config: plain(source),
  }
}

/** Parse pasted JSON into a `name → server` map, accepting common formats. */
function parseServerDocument(text, allowNameless = false) {
  let document
  try {
    document = JSON.parse(String(text).replace(/^\uFEFF/, ''))
  } catch (error) {
    throw fail('invalid-json', `JSON 解析失败：${messageOf(error)}`)
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw fail('invalid-json', '需要一个 JSON 对象。')
  }
  const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (isMap(document.mcpServers)) return document.mcpServers
  if (isMap(document.servers)) return document.servers
  if (isMap(document.mcp)) return document.mcp
  const looksLikeOne =
    typeof document.command === 'string' ||
    typeof document.url === 'string' ||
    document.transport !== undefined ||
    document.type !== undefined
  if (looksLikeOne) {
    const name = document.name ?? document.serverName
    if (typeof name !== 'string' || name.trim() === '') {
      if (allowNameless) return { '': document }
      throw fail('name-required', '单个服务器配置需要一个 name 或 serverName 字段。')
    }
    return { [name]: document }
  }
  const entries = Object.entries(document)
  if (entries.length > 0 && entries.every(([, value]) => isMap(value))) return document
  throw fail('invalid-json', '没有找到 mcpServers、servers，或 “名称 → 服务器” 映射。')
}

/** Locate a Loader entry by its stable entry id. */
function entryById(ctx, entryId) {
  if (typeof entryId !== 'string' || entryId === '') throw fail('not-found', '缺少 entryId。')
  const entries = [...ctx.loader.entries()]
  const entry = entries.find(item => item.id === entryId)
  if (entry === undefined) throw fail('not-found', `找不到插件行 “${entryId}”。`)
  return entry
}

/** Read the live tools each MCP server registered, keyed by server name. */
function collectTools(ctx) {
  const map = new Map()
  try {
    const tools = ctx.get('tools')
    if (tools === undefined || typeof tools.definitions !== 'function') return map
    for (const definition of tools.definitions()) {
      const name = definition?.name
      if (typeof name !== 'string' || !name.startsWith('mcp__')) continue
      const rest = name.slice('mcp__'.length)
      const separator = rest.indexOf('__')
      if (separator <= 0) continue
      const server = rest.slice(0, separator)
      const tool = rest.slice(separator + 2)
      if (!map.has(server)) map.set(server, [])
      map.get(server).push(tool)
    }
  } catch {
    // A missing tool registry merely hides the tool list.
  }
  for (const list of map.values()) list.sort()
  return map
}

/** Read the manager's live status registry, keyed by server name. */
function collectStatuses(ctx, warnings) {
  const map = new Map()
  let manager
  try {
    manager = ctx.get('mcpManager')
  } catch {
    manager = undefined
  }
  if (manager === undefined || typeof manager.list !== 'function') return map
  try {
    for (const view of manager.list()) {
      if (view === null || typeof view !== 'object') continue
      const status = view.status !== null && typeof view.status === 'object' ? view.status : { state: 'unknown' }
      map.set(String(view.name), { configured: view.configured === true, ...status })
    }
  } catch (error) {
    warnings.push(`读取 MCP 运行状态失败：${messageOf(error)}`)
  }
  return map
}

/** Normalize a Cordis fiber state to a short phase name. */
function phaseOf(entry) {
  let state
  try {
    state = entry.fiber?.state
  } catch {
    state = undefined
  }
  switch (state) {
    case 0: return 'pending'
    case 1: return 'loading'
    case 2: return 'active'
    case 3: return 'failed'
    case 5: return 'unloading'
    default: return null
  }
}

/** The external MCP configuration files this platform is likely to have. */
function discoveryCandidates() {
  const home = homedir()
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const list = []
  if (process.platform === 'win32') {
    list.push(
      { id: 'claude-desktop', label: 'Claude Desktop', path: join(appData, 'Claude', 'claude_desktop_config.json'), section: 'mcpServers' },
      { id: 'cursor', label: 'Cursor', path: join(home, '.cursor', 'mcp.json'), section: 'mcpServers' },
      { id: 'cursor-app', label: 'Cursor (app data)', path: join(appData, 'Cursor', 'User', 'mcp.json'), section: 'mcpServers' },
      { id: 'vscode', label: 'VS Code', path: join(appData, 'Code', 'User', 'mcp.json'), section: 'servers' },
      { id: 'vscode-insiders', label: 'VS Code Insiders', path: join(appData, 'Code - Insiders', 'User', 'mcp.json'), section: 'servers' },
      { id: 'windsurf', label: 'Windsurf', path: join(home, '.codeium', 'windsurf', 'mcp_config.json'), section: 'mcpServers' },
      { id: 'cline', label: 'Cline', path: join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'), section: 'mcpServers' },
      { id: 'roo-code', label: 'Roo Code', path: join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'), section: 'mcpServers' },
      { id: 'trae', label: 'Trae', path: join(appData, 'Trae', 'User', 'mcp.json'), section: 'mcpServers' },
      { id: 'claude-code', label: 'Claude Code', path: join(home, '.claude.json'), section: 'mcpServers' },
      { id: 'dsh-local', label: 'DSH local data', path: join(localAppData, 'Programs', 'dsh', 'mcp.json'), section: 'mcpServers' },
    )
  } else if (process.platform === 'darwin') {
    list.push(
      { id: 'claude-desktop', label: 'Claude Desktop', path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), section: 'mcpServers' },
      { id: 'cursor', label: 'Cursor', path: join(home, '.cursor', 'mcp.json'), section: 'mcpServers' },
      { id: 'vscode', label: 'VS Code', path: join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'), section: 'servers' },
      { id: 'windsurf', label: 'Windsurf', path: join(home, '.codeium', 'windsurf', 'mcp_config.json'), section: 'mcpServers' },
      { id: 'claude-code', label: 'Claude Code', path: join(home, '.claude.json'), section: 'mcpServers' },
    )
  } else {
    list.push(
      { id: 'claude-desktop', label: 'Claude Desktop', path: join(home, '.config', 'Claude', 'claude_desktop_config.json'), section: 'mcpServers' },
      { id: 'cursor', label: 'Cursor', path: join(home, '.cursor', 'mcp.json'), section: 'mcpServers' },
      { id: 'vscode', label: 'VS Code', path: join(home, '.config', 'Code', 'User', 'mcp.json'), section: 'servers' },
      { id: 'windsurf', label: 'Windsurf', path: join(home, '.codeium', 'windsurf', 'mcp_config.json'), section: 'mcpServers' },
      { id: 'cline', label: 'Cline', path: join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'), section: 'mcpServers' },
      { id: 'claude-code', label: 'Claude Code', path: join(home, '.claude.json'), section: 'mcpServers' },
    )
  }
  return list
}

/** The server map inside a third-party document, honoring its declared section. */
function extractSection(document, section) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return undefined
  const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (typeof section === 'string' && isMap(document[section])) return document[section]
  for (const key of ['mcpServers', 'servers', 'mcp']) {
    if (isMap(document[key])) return document[key]
  }
  return undefined
}

/** Read MCP servers from the other agent tools installed for this user. */
async function discover(ctx, refresh) {
  const now = Date.now()
  if (!refresh && now - discoveryCache.at < DISCOVERY_TTL_MS) return discoveryCache.value
  const found = []
  for (const candidate of discoveryCandidates()) {
    let text
    try {
      const info = await stat(candidate.path)
      if (!info.isFile()) continue
      if (info.size > MAX_CONFIG_BYTES) {
        found.push({ id: candidate.id, label: candidate.label, path: candidate.path, error: '文件超过 2 MB，已跳过。', servers: [] })
        continue
      }
      text = await readFile(candidate.path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
      found.push({ id: candidate.id, label: candidate.label, path: candidate.path, error: messageOf(error), servers: [] })
      continue
    }
    let document
    try {
      document = JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch (error) {
      found.push({ id: candidate.id, label: candidate.label, path: candidate.path, error: `JSON 解析失败：${messageOf(error)}`, servers: [] })
      continue
    }
    const section = extractSection(document, candidate.section)
    if (section === undefined) continue
    const servers = []
    for (const [name, raw] of Object.entries(section)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        servers.push({ name, error: '配置不是对象。' })
        continue
      }
      try {
        assertServerName(name)
        const config = normalizeManagerEntry(raw)
        servers.push({ name, transport: config.transport, config })
      } catch (error) {
        servers.push({ name, error: messageOf(error) })
      }
    }
    if (servers.length > 0) {
      found.push({ id: candidate.id, label: candidate.label, path: candidate.path, section: candidate.section, servers })
    }
  }
  discoveryCache = { at: now, value: found }
  return found
}

/** Resolve the manager row, settings service, and its current form descriptor. */
function requireManager(ctx) {
  let entries
  try {
    entries = [...ctx.loader.entries()]
  } catch (error) {
    throw fail('loader-unavailable', `读取插件清单失败：${messageOf(error)}`)
  }
  const entry = entries.find(item => item.options?.name === MANAGER_PKG)
  if (entry === undefined) {
    throw fail('manager-missing', '当前 profile 没有挂载 MCP 管理器（@deepseek-ai/dsh-mcp-manager），无法保存托管服务器。')
  }
  if (entry.disabled === true) {
    throw fail('manager-disabled', 'MCP 管理器当前被停用，无法保存托管服务器。')
  }
  let settings
  try {
    settings = ctx.get('settings')
  } catch {
    settings = undefined
  }
  if (settings === undefined || typeof settings.describe !== 'function') {
    throw fail('settings-missing', '设置服务未就绪，无法保存 MCP 配置。')
  }
  let descriptor
  try {
    descriptor = settings.describe().find(item => item.ns === entry.options.id)
  } catch (error) {
    throw fail('manager-unavailable', `读取 MCP 管理器配置失败：${messageOf(error)}`)
  }
  if (descriptor === undefined) {
    throw fail('manager-unavailable', 'MCP 管理器还没有运行完成或当前不可配置，请稍后重试。')
  }
  return { entry, settings, descriptor }
}

/** Write the complete managed server map through the settings service. */
async function writeServers(manager, map) {
  const cleaned = {}
  for (const [name, config] of Object.entries(map)) {
    cleaned[assertServerName(name)] = cleanManagerConfig(config)
  }
  await manager.settings.mutate(
    manager.descriptor.ns,
    [{ op: 'set', path: ['servers'], value: cleaned }],
    manager.descriptor.revision,
  )
}

/** Every MCP entry the current profile composes, managed or static. */
function relevantEntries(ctx) {
  let entries
  try {
    entries = [...ctx.loader.entries()]
  } catch {
    return []
  }
  return entries
}

/** Build the complete page snapshot. */
async function buildState(ctx, options = {}) {
  const warnings = []
  const capabilities = { managed: false, staticEditable: false, discovery: true }
  const manager = { present: false, available: false, registered: [] }
  const servers = []
  const staticServers = []
  const entries = relevantEntries(ctx)
  const toolsByServer = collectTools(ctx)
  const statuses = collectStatuses(ctx, warnings)
  const managerEntry = entries.find(item => item.options?.name === MANAGER_PKG)
  const settings = (() => {
    try {
      return ctx.get('settings')
    } catch {
      return undefined
    }
  })()

  if (managerEntry !== undefined) {
    manager.present = true
    manager.entryId = managerEntry.id
    manager.ns = managerEntry.options.id
    manager.enabled = managerEntry.disabled !== true
    let descriptor
    if (settings !== undefined && typeof settings.describe === 'function') {
      try {
        descriptor = settings.describe().find(item => item.ns === managerEntry.options.id)
      } catch (error) {
        warnings.push(`读取 MCP 管理器配置失败：${messageOf(error)}`)
      }
    }
    if (descriptor !== undefined && manager.enabled) {
      capabilities.managed = true
      manager.available = true
      manager.revision = descriptor.revision
      const effective = descriptor.value?.servers ?? {}
      const user = descriptor.user?.servers ?? {}
      const base = descriptor.base?.servers ?? {}
      for (const [name, config] of Object.entries(effective)) {
        const inUser = Object.prototype.hasOwnProperty.call(user, name)
        const inBase = Object.prototype.hasOwnProperty.call(base, name)
        servers.push({
          name,
          ...summarizeServer(config),
          enabled: config?.enabled !== false,
          origin: inUser ? (inBase ? 'override' : 'profile') : 'base',
          status: statuses.get(name) ?? null,
          tools: toolsByServer.get(name) ?? [],
        })
      }
      for (const [name, status] of statuses) {
        if (status.configured !== true) manager.registered.push({ name, status })
      }
    } else if (!manager.enabled) {
      manager.reason = 'manager-disabled'
    } else {
      manager.reason = settings === undefined ? 'settings-missing' : 'descriptor-missing'
    }
  } else {
    manager.reason = 'manager-missing'
  }

  const configEditor = (() => {
    try {
      return ctx.get('configEditor')
    } catch {
      return undefined
    }
  })()
  const pluginManager = (() => {
    try {
      return ctx.get('pluginManager')
    } catch {
      return undefined
    }
  })()
  if (configEditor === undefined || pluginManager === undefined) capabilities.staticEditable = false
  else capabilities.staticEditable = true

  for (const entry of entries) {
    if (entry.options?.name !== CLIENT_PKG) continue
    const config = entry.options.config ?? {}
    const name = typeof config.serverName === 'string' ? config.serverName : ''
    staticServers.push({
      entryId: entry.id,
      name,
      ...summarizeServer(config),
      enabled: entry.disabled !== true,
      phase: phaseOf(entry),
      config: plain(config),
      tools: toolsByServer.get(name) ?? [],
      conflict: servers.some(server => server.name === name),
    })
  }

  let discovered = []
  try {
    discovered = await discover(ctx, options.refreshDiscovery === true)
  } catch (error) {
    warnings.push(`扫描本机 MCP 配置失败：${messageOf(error)}`)
  }

  return {
    ok: true,
    generatedAt: Date.now(),
    preferences: await readPreferences(),
    manager,
    capabilities,
    servers,
    staticServers,
    discovered,
    warnings,
  }
}

/** The names of static rows that currently reserve a server namespace. */
function staticNames(ctx) {
  const names = new Set()
  for (const entry of relevantEntries(ctx)) {
    if (entry.options?.name !== CLIENT_PKG) continue
    if (entry.disabled === true) continue
    const serverName = entry.options.config?.serverName
    if (typeof serverName === 'string' && serverName !== '') names.add(serverName)
  }
  return names
}

/** Add one or more managed servers. */
async function createServers(ctx, body) {
  const manager = requireManager(ctx)
  let map
  if (typeof body.json === 'string' && body.json.trim() !== '') {
    map = parseServerDocument(body.json)
  } else if (body.servers !== null && typeof body.servers === 'object' && !Array.isArray(body.servers)) {
    map = body.servers
  } else if (body.server !== null && typeof body.server === 'object') {
    const name = body.name ?? body.server.name ?? body.server.serverName
    if (typeof name !== 'string' || name.trim() === '') throw fail('name-required', '缺少服务器名称。')
    map = { [name]: body.server }
  } else {
    throw fail('empty', '没有要添加的服务器。')
  }
  const names = Object.keys(map)
  if (names.length === 0) throw fail('empty', '没有要添加的服务器。')
  const effective = plain(manager.descriptor.value?.servers ?? {})
  const reserved = staticNames(ctx)
  const built = {}
  for (const name of names) {
    assertServerName(name)
    if (effective[name] !== undefined) {
      throw fail('duplicate', `服务器 “${name}” 已存在，请换一个名称或直接编辑它。`, { name })
    }
    if (reserved.has(name)) {
      throw fail('static-collision', `服务器名 “${name}” 已被静态配置的 MCP 行占用；请换一个名称，或先停用那一行。`, { name })
    }
    built[name] = normalizeManagerEntry(map[name])
  }
  await writeServers(manager, { ...effective, ...built })
  return { state: await buildState(ctx), added: names }
}

/** Replace one managed server's configuration. */
async function updateServer(ctx, body) {
  const manager = requireManager(ctx)
  const name = assertServerName(body.name)
  const effective = plain(manager.descriptor.value?.servers ?? {})
  if (effective[name] === undefined) throw fail('not-found', `找不到托管服务器 “${name}”。`, { name })
  let raw = body.server ?? body.config
  if (typeof body.json === 'string' && body.json.trim() !== '') {
    const map = parseServerDocument(body.json, true)
    raw = map[name] ?? map[''] ?? (Object.keys(map).length === 1 ? Object.values(map)[0] : undefined)
    if (raw === undefined) {
      throw fail('json-name-mismatch', `JSON 中没有名为 “${name}” 的服务器配置。`, { name })
    }
  }
  if (raw === null || typeof raw !== 'object') throw fail('server-required', '缺少服务器配置。')
  const normalized = normalizeManagerEntry(raw)
  // An edit keeps the server's durable enabled intent unless the caller states it.
  if (raw.enabled === undefined && raw.disabled === undefined) {
    normalized.enabled = effective[name].enabled !== false
  }
  const next = { ...effective, [name]: normalized }
  await writeServers(manager, next)
  return { state: await buildState(ctx) }
}

/** Delete one managed server. */
async function removeServer(ctx, body) {
  const manager = requireManager(ctx)
  const name = assertServerName(body.name)
  const effective = plain(manager.descriptor.value?.servers ?? {})
  const base = manager.descriptor.base?.servers ?? {}
  if (effective[name] === undefined) throw fail('not-found', `找不到托管服务器 “${name}”。`, { name })
  if (base[name] !== undefined) {
    throw fail('inherited-readonly', `服务器 “${name}” 来自 profile 的基础配置，不能删除；可以停用它。`, { name })
  }
  const next = { ...effective }
  delete next[name]
  await writeServers(manager, next)
  return { state: await buildState(ctx) }
}

/** Enable or disable one managed server without removing its configuration. */
async function toggleServer(ctx, body) {
  const manager = requireManager(ctx)
  const name = assertServerName(body.name)
  const effective = plain(manager.descriptor.value?.servers ?? {})
  if (effective[name] === undefined) throw fail('not-found', `找不到托管服务器 “${name}”。`, { name })
  const enabled = body.enabled === undefined ? effective[name].enabled === false : body.enabled !== false
  const next = { ...effective, [name]: { ...effective[name], enabled } }
  await writeServers(manager, next)
  return { state: await buildState(ctx), enabled }
}

/** Rebuild one managed server's live connection. */
async function restartServer(ctx, body) {
  const manager = requireManager(ctx)
  const name = assertServerName(body.name)
  let live
  try {
    live = ctx.get('mcpManager')
  } catch {
    live = undefined
  }
  if (live === undefined || typeof live.restart !== 'function') {
    throw fail('manager-missing', 'MCP 管理器服务不可用，无法重启。')
  }
  await live.restart(name)
  return { state: await buildState(ctx) }
}

/** Probe one managed server without touching its live instance. */
async function probeServer(ctx, body) {
  const name = assertServerName(body.name)
  let live
  try {
    live = ctx.get('mcpManager')
  } catch {
    live = undefined
  }
  if (live === undefined || typeof live.probe !== 'function') {
    throw fail('manager-missing', 'MCP 管理器服务不可用，无法探测。')
  }
  const timeout = positiveNumber(body.timeoutMs) ?? PROBE_TIMEOUT_MS
  const result = await live.probe(name, { timeoutMs: timeout })
  return { probe: result }
}

/** Enable or disable one statically composed mcp-client row. */
async function staticToggle(ctx, body) {
  const entry = entryById(ctx, body.entryId)
  if (entry.options?.name !== CLIENT_PKG) throw fail('not-mcp-client', '这个插件行不是 MCP 客户端。')
  let pluginManager
  try {
    pluginManager = ctx.get('pluginManager')
  } catch {
    pluginManager = undefined
  }
  if (pluginManager === undefined || typeof pluginManager.setPluginEnabled !== 'function') {
    throw fail('plugin-manager-missing', '插件管理服务不可用，无法启停静态 MCP 行。')
  }
  const enabled = body.enabled !== false
  const outcome = await pluginManager.setPluginEnabled(entry.id, enabled)
  return { change: outcome, state: await buildState(ctx) }
}

/** Build the next static mcp-client config, clearing the other transport's fields. */
function staticNextConfig(current, input) {
  if (input === null || typeof input !== 'object') throw fail('server-required', '缺少服务器配置。')
  const transport = transportOf(input) || transportOf(current)
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw fail('transport-required', '请选择传输方式：stdio 或 streamable-http。')
  }
  const out = {}
  for (const key of ['serverName', 'expandTemplates', 'maxInstructionBytes', 'failOnStartupError']) {
    if (current[key] !== undefined) out[key] = current[key]
  }
  out.serverName = typeof current.serverName === 'string' && current.serverName !== '' ? current.serverName : input.serverName
  assertServerName(out.serverName)
  out.transport = transport
  if (transport === 'stdio') {
    const command = str(input.command ?? current.command).trim()
    if (command === '') throw fail('command-required', 'stdio 服务器必须填写启动命令（command）。')
    out.command = command
    const args = stringArray(input.args ?? current.args)
    if (args.length > 0) out.args = args
    const env = stringMap(input.env ?? current.env)
    if (Object.keys(env).length > 0) out.env = env
    const cwd = str(input.cwd ?? current.cwd).trim()
    if (cwd !== '') out.cwd = cwd
  } else {
    const url = str(input.url ?? current.url).trim()
    if (!/^https?:\/\/\S+$/i.test(url)) throw fail('url-required', 'streamable-http 服务器必须填写以 http:// 或 https:// 开头的 URL。')
    out.url = url
    const headers = stringMap(input.headers ?? current.headers)
    if (Object.keys(headers).length > 0) out.headers = headers
  }
  for (const key of ['toolCallTimeoutMs', 'startupTimeoutMs', 'closeTimeoutMs']) {
    const number = positiveNumber(input[key] ?? current[key])
    if (number !== undefined) out[key] = number
  }
  const reconnect = reconnectOf(input.reconnect !== undefined ? input.reconnect : current.reconnect)
  if (reconnect !== undefined) out.reconnect = reconnect
  if (input.failOnStartupError !== undefined) out.failOnStartupError = input.failOnStartupError === true
  return out
}

/** Edit one statically composed mcp-client row. */
async function staticUpdate(ctx, body) {
  const entry = entryById(ctx, body.entryId)
  if (entry.options?.name !== CLIENT_PKG) throw fail('not-mcp-client', '这个插件行不是 MCP 客户端。')
  if (entry.disabled === true) throw fail('disabled', '这个静态 MCP 行已停用，请先启用再编辑。')
  let configEditor
  try {
    configEditor = ctx.get('configEditor')
  } catch {
    configEditor = undefined
  }
  if (configEditor === undefined || typeof configEditor.edit !== 'function') {
    throw fail('config-editor-missing', '配置编辑服务不可用，无法保存静态 MCP 行。')
  }
  const current = entry.options.config ?? {}
  let input = body.server ?? body.config
  if (typeof body.json === 'string' && body.json.trim() !== '') {
    const map = parseServerDocument(body.json, true)
    input = map[current.serverName] ?? map[''] ?? (Object.keys(map).length === 1 ? Object.values(map)[0] : undefined)
    if (input === undefined) throw fail('json-name-mismatch', `JSON 中没有名为 “${String(current.serverName)}” 的服务器配置。`)
  }
  const next = staticNextConfig(current, input)
  await configEditor.edit(entry, () => next)
  return { state: await buildState(ctx) }
}

/** Dispatch one browser action and return its result. */
async function dispatch(ctx, body) {
  const action = typeof body.action === 'string' ? body.action : ''
  switch (action) {
    case 'create':
    case 'import':
      return createServers(ctx, body)
    case 'update':
      return updateServer(ctx, body)
    case 'remove':
      return removeServer(ctx, body)
    case 'toggle':
      return toggleServer(ctx, body)
    case 'restart':
      return restartServer(ctx, body)
    case 'probe':
      return probeServer(ctx, body)
    case 'static-toggle':
      return staticToggle(ctx, body)
    case 'static-update':
      return staticUpdate(ctx, body)
    case 'preferences': {
      if (typeof body.sidebarShortcut !== 'boolean') {
        throw fail('invalid-preference', 'sidebarShortcut 必须是布尔值。')
      }
      await writePreferences({ sidebarShortcut: body.sidebarShortcut })
      return { state: await buildState(ctx) }
    }
    case 'refresh':
      return { state: await buildState(ctx, { refreshDiscovery: true }) }
    default:
      throw fail('unknown-action', `未知操作 “${action}”。`)
  }
}

/** One management request. */
async function handle(ctx, request, response) {
  try {
    if (!authorized(ctx, request, response)) return
    if (request.method === 'GET') {
      const state = await buildState(ctx)
      sendJson(response, 200, state)
      return
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    if (!sameOrigin(request, true)) {
      sendJson(response, 403, { ok: false, error: 'not-same-origin' })
      return
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      sendJson(response, 400, { ok: false, code: error?.code ?? 'invalid-body', error: messageOf(error) })
      return
    }
    const result = await dispatch(ctx, body)
    sendJson(response, 200, { ok: true, ...result })
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'error'
    sendJson(response, 200, {
      ok: false,
      code,
      error: messageOf(error),
      ...(error?.details !== undefined ? { details: error.details } : {}),
    })
  }
}

export const name = 'dsh-mcp-hub'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register(
      { kind: 'exact', path: ROUTE, handler: (request, response) => handle(ctx, request, response) },
      'dsh-mcp-hub: management api',
    ),
    'dsh-mcp-hub: management api route',
  )
  ctx.logger?.info?.('dsh-mcp-hub: management api mounted at %s', ROUTE)
}
