// Render smoke test for the dsh-mcp-hub browser half, without a browser:
// a minimal React stand-in renders component trees so typos and undefined
// references in the render paths fail here instead of in the settings panel.
// Run: node test/client-render-smoke.mjs

let hookIndex = 0
let stateInjection = undefined
let idCounter = 0

function resolveInitial(value) {
  return typeof value === 'function' ? value() : value
}

const React = {
  Fragment: Symbol.for('react.fragment'),
  createElement(type, props, ...children) {
    const kids = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    return { type, props: { ...(props ?? {}), ...(kids === undefined ? {} : { children: kids }) }, children }
  },
  useState(initial) {
    const index = hookIndex++
    if (stateInjection !== undefined && Object.prototype.hasOwnProperty.call(stateInjection, index)) {
      return [stateInjection[index], () => {}]
    }
    return [resolveInitial(initial), () => {}]
  },
  useEffect() {},
  useRef(value) {
    return { current: value }
  },
  useCallback(callback) {
    return callback
  },
  useId() {
    idCounter += 1
    return 'test-id-' + String(idCounter)
  },
  isValidElement(value) {
    return value !== null && typeof value === 'object' && 'type' in value && 'props' in value
  },
  cloneElement(element, extra) {
    return { type: element.type, props: { ...element.props, ...extra }, children: element.children }
  },
}

globalThis.window = {
  __ModuleLoader__: {
    load(registration) {
      globalThis.__hubRegistration = registration
    },
  },
}

const moduleUrl = new URL('../client.js', import.meta.url).href
await import(moduleUrl)

const registration = globalThis.__hubRegistration
if (registration === undefined || registration.id !== 'dsh-mcp-hub') throw new Error('client bundle did not register')

let dictionary = {}
const registrations = {}
const ctx = {
  effect(callback) {
    const disposer = callback()
    return disposer ?? (() => {})
  },
  locale: {
    register(_ns, dicts) {
      dictionary = dicts.zh ?? {}
      return () => {}
    },
    bind() {
      return (key) => dictionary[key] ?? key
    },
    subscribe() {
      return () => {}
    },
  },
  slots: {
    inject(_key, callback) {
      const disposer = callback()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    register(options, component) {
      registrations[options.name] = { options, component }
      return () => { delete registrations[options.name] }
    },
  },
}

const ui = registration.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error('unexpected require ' + specifier)
})
const styleTag = { id: 'dsh-mcp-hub-styles', textContent: 'old rules' }
globalThis.document = {
  getElementById: (id) => (id === 'dsh-mcp-hub-styles' ? styleTag : null),
  createElement: () => ({}),
  head: { appendChild() {} },
}
ui.apply(ctx)
if (!styleTag.textContent.includes('.mcp-hub-page') || styleTag.textContent === 'old rules') {
  throw new Error('an existing stylesheet tag was not refreshed')
}

if (registrations['settings.section']?.options?.id !== 'mcp-hub') throw new Error('settings section not registered')
if (registrations.main?.options?.key !== 'mcp-hub') throw new Error('main panel not registered')
if (registrations['sidebar.panellist']?.options?.id !== 'mcp-hub') throw new Error('sidebar entry not registered')
// The switch must add and remove the sidebar entry through the module face.
ui.__parts.setSidebarShortcut(false)
if (registrations['sidebar.panellist'] !== undefined) throw new Error('sidebar entry was not removed')
ui.__parts.setSidebarShortcut(true)
if (registrations['sidebar.panellist']?.options?.id !== 'mcp-hub') throw new Error('sidebar entry was not restored')
const registered = registrations['settings.section']
if (typeof registered.component !== 'function') throw new Error('section component missing')

function collect(node, acc) {
  if (node === null || node === undefined || node === false || node === true) return
  if (Array.isArray(node)) {
    for (const child of node) collect(child, acc)
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    acc.text.push(String(node))
    return
  }
  if (typeof node !== 'object') return
  if (node.type === React.Fragment) {
    collect(node.children, acc)
    return
  }
  if (typeof node.type === 'function') {
    collect(node.type(node.props), acc)
    return
  }
  const className = node.props?.className
  if (typeof className === 'string') acc.classes.push(className)
  const children = node.children !== undefined && node.children.length > 0 ? node.children : node.props?.children
  collect(children, acc)
}

function renderTree(component, props, injection) {
  hookIndex = 0
  stateInjection = injection
  idCounter = 0
  const tree = component(props)
  const acc = { classes: [], text: [] }
  hookIndex = 0
  stateInjection = undefined
  collect(tree, acc)
  return { tree, classes: acc.classes, text: acc.text.join(' ') }
}

const parts = ui.__parts
if (parts === undefined) throw new Error('test seam missing')
const assert = (condition, label, extra) => {
  if (!condition) throw new Error('ASSERT ' + label + (extra === undefined ? '' : '\n' + JSON.stringify(extra).slice(0, 1200)))
  console.log('ok -', label)
}

const connected = {
  name: 'github',
  transport: 'streamable-http',
  url: 'https://example.com/mcp',
  headers: { Authorization: 'Bearer ${credential:MCP_TOKEN}' },
  command: '',
  args: [],
  env: {},
  cwd: '',
  config: { transport: 'streamable-http', url: 'https://example.com/mcp' },
  enabled: true,
  origin: 'profile',
  status: { configured: true, state: 'connected', toolCount: 2, connectedAt: Date.now() },
  tools: ['search', 'fetch'],
}
const disabled = {
  name: 'offline',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'pkg'],
  env: { TOKEN: 'x' },
  cwd: '',
  url: '',
  headers: {},
  config: { transport: 'stdio', command: 'npx' },
  enabled: false,
  origin: 'profile',
  status: { configured: true, state: 'disabled' },
  tools: [],
}
const failed = {
  name: 'broken',
  transport: 'stdio',
  command: 'missing.exe',
  args: [],
  env: {},
  cwd: '',
  url: '',
  headers: {},
  config: {},
  enabled: true,
  origin: 'base',
  status: { configured: true, state: 'failed', reason: 'gave-up', lastError: 'spawn missing.exe ENOENT' },
  tools: [],
}

const state = {
  ok: true,
  preferences: { sidebarShortcut: true },
  manager: { present: true, available: true, enabled: true, ns: 'mcp-manager', revision: 4, registered: [] },
  capabilities: { managed: true, staticEditable: true, discovery: true },
  servers: [connected, disabled, failed],
  staticServers: [
    {
      entryId: 'include:windows-mcp-bridge',
      name: 'windows',
      transport: 'stdio',
      command: 'C:\\tools\\windows-mcp.exe',
      args: ['serve'],
      env: { SCALE: '0.75' },
      cwd: '',
      url: '',
      headers: {},
      config: { serverName: 'windows', transport: 'stdio', command: 'C:\\tools\\windows-mcp.exe' },
      enabled: true,
      phase: 'active',
      tools: ['Screenshot', 'Click'],
      conflict: false,
    },
    {
      entryId: 'include:other-mcp',
      name: 'other',
      transport: 'streamable-http',
      url: 'https://other.example/mcp',
      command: '',
      args: [],
      env: {},
      cwd: '',
      headers: {},
      config: {},
      enabled: false,
      phase: null,
      tools: [],
      conflict: false,
    },
  ],
  discovered: [
    {
      id: 'cursor',
      label: 'Cursor',
      path: 'C:\\Users\\me\\.cursor\\mcp.json',
      servers: [{ name: 'fromCursor', transport: 'stdio', config: { transport: 'stdio', command: 'npx', args: ['-y', 'x'] } }],
    },
    {
      id: 'broken-file',
      label: 'VS Code',
      path: 'C:\\Users\\me\\AppData\\Roaming\\Code\\User\\mcp.json',
      error: 'JSON parse failed',
      servers: [],
    },
  ],
  warnings: ['a diagnostic'],
}

// 1. Loading state
{
  const result = renderTree(registered.component, {})
  assert(result.text.includes('正在读取 MCP 配置'), 'loading state renders', result.text)
}
// 2. Full loaded page
{
  const result = renderTree(registered.component, {}, { 1: state })
  assert(result.classes.some((value) => value.includes('mcp-hub')), 'page container renders')
  assert(result.text.includes('github') && result.text.includes('windows'), 'managed and static servers render', result.text)
  assert(result.text.includes('从本机其他应用导入'), 'import section renders')
  assert(result.text.includes('fromCursor'), 'discovered server renders')
  assert(result.text.includes('左侧栏快捷入口'), 'sidebar shortcut switch renders', result.text)
  assert(result.classes.includes('mcp-hub-card-error') === false, 'no error row by default')
}
// 2b. Main panel page
{
  const result = renderTree(parts.HubPage, {})
  assert(result.classes.includes('mcp-hub-page'), 'main panel page renders')
  assert(result.text.includes('MCP 服务器'), 'page title renders', result.text)
}
// 3. Managed card variants
{
  const busy = renderTree(parts.ManagedCard, { server: connected, busy: false, probe: undefined, onToggle() {}, onRestart() {}, onProbe() {}, onEdit() {}, onDelete() {} })
  assert(busy.text.includes('已连接') && busy.text.includes('search'), 'connected card shows status and tools', busy.text)
  const restarting = renderTree(parts.ManagedCard, { server: connected, busy: true, activeKind: 'restart', onToggle() {}, onRestart() {}, onProbe() {}, onEdit() {}, onDelete() {} })
  assert(restarting.text.includes('正在重启'), 'restart progress renders', restarting.text)
  const baseCard = renderTree(parts.ManagedCard, { server: failed, busy: false, error: 'boom', onToggle() {}, onRestart() {}, onProbe() {}, onEdit() {}, onDelete() {} })
  assert(baseCard.text.includes('基础配置') && baseCard.text.includes('不能删除'), 'base card explains delete', baseCard.text)
  assert(baseCard.text.includes('boom'), 'card error renders', baseCard.text)
  const probed = renderTree(parts.ManagedCard, {
    server: connected,
    busy: false,
    probe: { state: 'done', result: { ok: true, toolNames: ['a', 'b'], durationMs: 12, closeConfirmed: true } },
    onToggle() {}, onRestart() {}, onProbe() {}, onEdit() {}, onDelete() {},
  })
  assert(probed.text.includes('连接成功'), 'probe result renders', probed.text)
}
// 4. Static card
{
  const result = renderTree(parts.StaticCard, { server: state.staticServers[0], busy: false, canEdit: true, onToggle() {}, onEdit() {} })
  assert(result.text.includes('cordis') && result.text.includes('Screenshot'), 'static card renders tools', result.text)
  const off = renderTree(parts.StaticCard, { server: state.staticServers[1], busy: false, canEdit: true, onToggle() {}, onEdit() {} })
  assert(off.text.includes('已停用'), 'disabled static card renders', off.text)
}
// 5. Dialogs
{
  const add = renderTree(parts.ServerDialog, { mode: 'create', initial: null, staticMode: false, knownNames: [], onClose() {}, onSubmit() {} })
  assert(add.classes.includes('mcp-hub-dialog'), 'add dialog renders')
  assert(add.text.includes('表单') && add.text.includes('JSON') && add.text.includes('stdio'), 'dialog tabs and transport render', add.text)
  const edit = renderTree(parts.ServerDialog, { mode: 'edit', initial: connected, staticMode: false, knownNames: ['github'], onClose() {}, onSubmit() {} })
  assert(edit.text.includes('编辑 github'), 'edit dialog title renders', edit.text)
  const staticEdit = renderTree(parts.ServerDialog, { mode: 'edit', initial: state.staticServers[0], staticMode: true, knownNames: [], onClose() {}, onSubmit() {} })
  assert(staticEdit.text.includes('Edit') || staticEdit.text.includes('编辑'), 'static edit dialog renders', staticEdit.text)
  const confirm = renderTree(parts.ConfirmDialog, { title: '删除服务器', body: '确认？', danger: true, confirmLabel: '删除', busy: false, onClose() {}, onConfirm() {} })
  assert(confirm.text.includes('确认？') && confirm.text.includes('取消'), 'confirm dialog renders', confirm.text)
}
// 6. Section without a manager
{
  const noManager = {
    ...state,
    manager: { present: false, available: false, reason: 'manager-missing', registered: [] },
    capabilities: { managed: false, staticEditable: true, discovery: true },
    servers: [],
  }
  const result = renderTree(registered.component, {}, { 1: noManager })
  assert(result.text.includes('没有检测到 MCP 管理器') || result.text.includes('没有挂载'), 'manager-missing notice renders', result.text)
}
// 7. Fields are labelled
{
  const withChild = renderTree(parts.Field, { label: '名称', hint: '提示', children: React.createElement('input', { className: 'mcp-hub-input' }) })
  assert(withChild.classes.includes('mcp-hub-field'), 'field renders')
}

console.log('\nAll client render smoke tests passed.')
