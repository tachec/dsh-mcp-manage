// Functional smoke test for the dsh-mcp-hub Host half, against a mocked Harness.
// Run: node test/host-smoke.mjs
import { mkdtemp, readFile as readFileFs, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testHome = await mkdtemp(join(tmpdir(), 'mcp-hub-host-'))
process.env.DSH_HOME = testHome

const pluginUrl = new URL('../index.js', import.meta.url).href
const { apply } = await import(pluginUrl)

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))
const baseServers = {}
let effectiveServers = {}
let userServers = {}
let revision = 0

const managerEntry = {
  id: 'include:mcp-manager',
  options: { id: 'mcp-manager', name: '@deepseek-ai/dsh-mcp-manager', config: {} },
  disabled: false,
  fiber: { state: 2 },
}
const staticEntry = {
  id: 'include:windows-mcp-bridge',
  options: {
    id: 'windows-mcp-bridge',
    name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: 'windows', transport: 'stdio', command: 'C:\\tools\\windows-mcp.exe', args: ['serve'], failOnStartupError: false, reconnect: { enabled: true, maxAttempts: 3 } },
  },
  disabled: false,
  fiber: { state: 2 },
}
const entries = [managerEntry, staticEntry]
const calls = []

const settings = {
  describe() {
    return [{
      ns: 'mcp-manager',
      revision,
      value: { servers: clone(effectiveServers) },
      base: { servers: clone(baseServers) },
      user: { servers: clone(userServers) },
    }]
  },
  async mutate(ns, ops) {
    calls.push(['mutate', ns, clone(ops)])
    for (const op of ops) {
      if (op.op === 'set' && op.path.length === 1 && op.path[0] === 'servers') {
        userServers = clone(op.value)
        effectiveServers = clone(op.value)
      } else {
        throw new Error('unexpected op ' + JSON.stringify(op))
      }
    }
    revision += 1
  },
}

const configEditor = {
  entries: () => entries,
  async edit(entry, change) {
    calls.push(['edit', entry.id])
    const next = change(clone(entry.options.config ?? {}), {})
    entry.options.config = next
  },
}

const pluginManager = {
  async setPluginEnabled(id, enabled) {
    calls.push(['setPluginEnabled', id, enabled])
    const entry = entries.find((item) => item.id === id)
    if (entry === undefined) throw new Error('unknown row ' + id)
    entry.disabled = !enabled
    return { application: 'applied', changed: true }
  },
}

const mcpManager = {
  list() {
    const list = Object.keys(effectiveServers).map((name) => ({
      name,
      configured: true,
      status: { state: 'connected', toolCount: 2, connectedAt: Date.now() },
    }))
    list.push({ name: 'plugin-registered', configured: false, status: { state: 'failed', reason: 'gave-up', lastError: 'boom' } })
    return list
  },
  async restart(name) {
    calls.push(['restart', name])
    return undefined
  },
  async probe(name) {
    calls.push(['probe', name])
    return { ok: true, toolNames: ['search', 'fetch'], truncated: false, durationMs: 12, closeConfirmed: true }
  },
}

const tools = {
  definitions() {
    return [{ name: 'mcp__github__search' }, { name: 'mcp__windows__Screenshot' }, { name: 'read' }]
  },
}

const connection = { authorizeIndex: () => true }

const routes = []
const ctx = {
  effect(callback) {
    const disposer = callback()
    return disposer ?? (() => {})
  },
  logger: { info() {} },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  loader: { entries: () => entries },
  get(service) {
    return {
      connection,
      settings,
      configEditor,
      pluginManager,
      mcpManager,
      tools,
    }[service]
  },
}

apply(ctx)
if (routes.length !== 1 || routes[0].path !== '/dsh-mcp-hub/api') throw new Error('route not registered')

function makeRequest(method, body) {
  const buffer = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  return {
    method,
    headers: {
      host: '127.0.0.1:7363',
      origin: 'http://127.0.0.1:7363',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (buffer !== undefined) yield buffer
    },
  }
}

function makeResponse() {
  return {
    headersSent: false,
    writableEnded: false,
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value },
    end(body) { this.body = body ?? ''; this.writableEnded = true },
  }
}

async function call(method, body) {
  const request = makeRequest(method, body)
  const response = makeResponse()
  await routes[0].handler(request, response)
  if (!response.writableEnded) throw new Error('handler did not answer')
  const data = JSON.parse(response.body)
  return { status: response.statusCode, data }
}

const assert = (condition, label, extra) => {
  if (!condition) throw new Error('ASSERT ' + label + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
  console.log('ok -', label)
}

// 1. Snapshot
{
  const { data } = await call('GET')
  assert(data.ok === true, 'GET snapshot ok')
  assert(data.manager.present === true && data.capabilities.managed === true, 'manager detected', data.manager)
  assert(data.servers.length === 0, 'no managed servers initially', data.servers)
  assert(data.staticServers.length === 1 && data.staticServers[0].name === 'windows', 'static row listed', data.staticServers)
  assert(data.staticServers[0].tools.includes('Screenshot'), 'static tools collected', data.staticServers[0].tools)
  assert(data.manager.registered.length === 1, 'registered server listed', data.manager.registered)
}

// 2. Create from a Claude/Cursor document
{
  const { data } = await call('POST', {
    action: 'create',
    json: JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'x' } } } }),
  })
  assert(data.ok === true && data.added[0] === 'github', 'create from mcpServers JSON', data)
  const state = await call('GET')
  const github = state.data.servers.find((server) => server.name === 'github')
  assert(github !== undefined, 'created server visible', state.data.servers)
  assert(github.transport === 'stdio' && github.command === 'npx', 'transport and command stored', github)
  assert(github.status.state === 'connected' && github.tools.includes('search'), 'status and tools merged', github)
}

// 3. Duplicate refused
{
  const { data } = await call('POST', { action: 'create', server: { transport: 'stdio', command: 'x' }, name: 'github' })
  assert(data.ok === false && data.code === 'duplicate', 'duplicate refused', data)
  assert(data.details && data.details.name === 'github', 'duplicate refusal carries the name', data)
}

// 4. Name collision with static row
{
  const { data } = await call('POST', { action: 'create', name: 'windows', server: { transport: 'stdio', command: 'x' } })
  assert(data.ok === false && data.code === 'static-collision', 'static collision refused', data)
}

// 5. Invalid input
{
  const badName = await call('POST', { action: 'create', name: 'bad name!', server: { transport: 'stdio', command: 'x' } })
  assert(badName.data.ok === false && badName.data.code === 'invalid-name', 'invalid name refused', badName.data)
  const sse = await call('POST', { action: 'create', json: JSON.stringify({ mcpServers: { old: { type: 'sse', url: 'https://x' } } }) })
  assert(sse.data.ok === false && sse.data.code === 'sse-unsupported', 'sse refused', sse.data)
  const noUrl = await call('POST', { action: 'create', json: JSON.stringify({ mcpServers: { h: { transport: 'streamable-http' } } }) })
  assert(noUrl.data.ok === false && noUrl.data.code === 'url-required', 'http requires url', noUrl.data)
}

// 6. Update to streamable-http
{
  const { data } = await call('POST', {
    action: 'update',
    name: 'github',
    server: { transport: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } },
  })
  assert(data.ok === true, 'update accepted', data)
  const state = await call('GET')
  const github = state.data.servers.find((server) => server.name === 'github')
  assert(github.transport === 'streamable-http' && github.url === 'https://example.com/mcp', 'update stored', github)
  assert(github.command === '', 'stdio fields cleared on transport switch', github)
}

// 7. Toggle, probe, restart
{
  const toggled = await call('POST', { action: 'toggle', name: 'github', enabled: false })
  assert(toggled.data.ok === true && toggled.data.enabled === false, 'toggle off', toggled.data)
  const state = await call('GET')
  assert(state.data.servers.find((server) => server.name === 'github').enabled === false, 'toggle persisted')
  const probe = await call('POST', { action: 'probe', name: 'github' })
  assert(probe.data.ok === true && probe.data.probe.ok === true, 'probe result returned', probe.data)
  const restart = await call('POST', { action: 'restart', name: 'github' })
  assert(restart.data.ok === true, 'restart accepted', restart.data)
  const on = await call('POST', { action: 'toggle', name: 'github', enabled: true })
  assert(on.data.ok === true, 'toggle on', on.data)
}

// 8. Delete
{
  const { data } = await call('POST', { action: 'remove', name: 'github' })
  assert(data.ok === true, 'remove accepted', data)
  const state = await call('GET')
  assert(state.data.servers.length === 0, 'removed from state', state.data.servers)
}

// 8b. Edit a server from a nameless single-object JSON document
{
  await call('POST', { action: 'create', json: JSON.stringify({ mcpServers: { editme: { command: 'node' } } }) })
  const edited = await call('POST', {
    action: 'update',
    name: 'editme',
    json: JSON.stringify({ transport: 'stdio', command: 'node', args: ['server.js'] }),
  })
  assert(edited.data.ok === true, 'nameless JSON edit accepted', edited.data)
  const state = await call('GET')
  const server = state.data.servers.find((item) => item.name === 'editme')
  assert(server.args[0] === 'server.js', 'nameless JSON edit stored', server)
  await call('POST', { action: 'remove', name: 'editme' })
}

// 9. Base-config server cannot be deleted but can be toggled
{
  baseServers.legacy = { transport: 'stdio', command: 'legacy' }
  effectiveServers.legacy = { transport: 'stdio', command: 'legacy' }
  userServers = {}
  const state = await call('GET')
  const legacy = state.data.servers.find((server) => server.name === 'legacy')
  assert(legacy.origin === 'base', 'base origin derived', legacy)
  const remove = await call('POST', { action: 'remove', name: 'legacy' })
  assert(remove.data.ok === false && remove.data.code === 'inherited-readonly', 'base server delete refused', remove.data)
  const toggle = await call('POST', { action: 'toggle', name: 'legacy', enabled: false })
  assert(toggle.data.ok === true, 'base server toggle accepted', toggle.data)
  delete baseServers.legacy
  effectiveServers = {}
  userServers = {}
}

// 10. Static row toggle and edit
{
  const off = await call('POST', { action: 'static-toggle', entryId: 'include:windows-mcp-bridge', enabled: false })
  assert(off.data.ok === true && off.data.change.application === 'applied', 'static row disabled', off.data)
  const blocked = await call('POST', {
    action: 'static-update',
    entryId: 'include:windows-mcp-bridge',
    server: { transport: 'stdio', command: 'cmd' },
  })
  assert(blocked.data.ok === false && blocked.data.code === 'disabled', 'static edit blocked while disabled', blocked.data)
  await call('POST', { action: 'static-toggle', entryId: 'include:windows-mcp-bridge', enabled: true })
  const edited = await call('POST', {
    action: 'static-update',
    entryId: 'include:windows-mcp-bridge',
    server: {
      transport: 'stdio',
      command: 'cmd.exe',
      args: ['/c', 'tools\\server.exe'],
      env: { A: '1' },
      startupTimeoutMs: 5000,
      failOnStartupError: true,
    },
  })
  assert(edited.data.ok === true, 'static edit accepted', edited.data)
  const state = await call('GET')
  const windows = state.data.staticServers[0]
  assert(windows.config.command === 'cmd.exe', 'static command stored', windows.config)
  assert(windows.config.args[1] === 'tools\\server.exe', 'static args stored', windows.config)
  assert(windows.config.startupTimeoutMs === 5000, 'static timeout stored', windows.config)
  assert(windows.config.failOnStartupError === true, 'static failOnStartupError stored', windows.config)
}

// 11. Single-server JSON with explicit name, and name→server map
{
  const single = await call('POST', {
    action: 'create',
    json: JSON.stringify({ name: 'single', transport: 'stdio', command: 'node' }),
  })
  assert(single.data.ok === true, 'single server object accepted', single.data)
  const mapped = await call('POST', {
    action: 'create',
    json: JSON.stringify({ mapped: { command: 'node', args: ['x'] } }),
  })
  assert(mapped.data.ok === true && mapped.data.added.length === 1, 'name→server map accepted', mapped.data)
}

// 12. Malformed JSON and method handling
{
  const malformed = await call('POST', { action: 'create', json: '{oops' })
  assert(malformed.data.ok === false && malformed.data.code === 'invalid-json', 'malformed JSON refused', malformed.data)
  const unknown = await call('POST', { action: 'nope' })
  assert(unknown.data.ok === false && unknown.data.code === 'unknown-action', 'unknown action refused', unknown.data)
}

// 13. Page preferences
{
  const initial = await call('GET')
  assert(initial.data.preferences?.sidebarShortcut === true, 'default sidebar shortcut is on', initial.data.preferences)
  const off = await call('POST', { action: 'preferences', sidebarShortcut: false })
  assert(off.data.ok === true && off.data.state.preferences.sidebarShortcut === false, 'preference off accepted', off.data)
  const saved = JSON.parse(await readFileFs(join(testHome, 'dsh-mcp-hub', 'preferences.json'), 'utf8'))
  assert(saved.sidebarShortcut === false, 'preference persisted to disk', saved)
  const back = await call('GET')
  assert(back.data.preferences.sidebarShortcut === false, 'preference read back', back.data.preferences)
  const bad = await call('POST', { action: 'preferences', sidebarShortcut: 'yes' })
  assert(bad.data.ok === false && bad.data.code === 'invalid-preference', 'invalid preference refused', bad.data)
}

// 14. Auth gate
{
  connection.authorizeIndex = (request, response) => {
    response.statusCode = 401
    response.setHeader('content-type', 'text/plain')
    response.end('denied')
    return false
  }
  const request = makeRequest('GET')
  const response = makeResponse()
  await routes[0].handler(request, response)
  assert(response.statusCode === 401 && response.body === 'denied', 'auth refusal owns the response', response.body)
}

await rm(testHome, { recursive: true, force: true })

console.log('\nAll Host smoke tests passed.')
