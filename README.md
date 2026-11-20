# dsh-mcp-manage

**中文** · [English](README.en.md)

在 DeepSeek Harness（dsh）里集中管理所有 MCP 服务器：新增、修改、删除、查看、热启停、探测、重启，一个页面搞定。

插件在 **设置 → MCP** 注册一个管理页，并可选地在左侧栏放一个 MCP 图标；点击图标会在主区域打开同一个管理页。它同时接管 DSH 原生的 MCP 管理器（`@deepseek-ai/dsh-mcp-manager`）和直接写在 profile / 插件补丁里的静态 `@deepseek-ai/dsh-mcp-client` 行，因此托管服务器和静态接入都能在这里看到。

## 功能

- **托管服务器完整增删改查**
  - 支持 `stdio` 与 `streamable-http` 两种传输；
  - 表单填写，或直接粘贴 JSON（兼容 Claude Desktop / Cursor 的 `mcpServers` 格式）；
  - 保存后立即写入当前 profile 并热挂载，不需要重启 DSH；
  - 开关即可热启停，不删除配置；
  - 一键探测（连接 + 列出工具）、一键重启（重建连接、重置重连预算）；
  - 实时显示连接状态、工具数量、工具名和完整配置。
- **静态接入管理**
  - 列出 profile / 插件补丁中的 `@deepseek-ai/dsh-mcp-client` 行；
  - 查看状态、工具，启停整行，编辑其配置；
  - 删除不由本插件负责（行属于声明它的补丁）。
- **从本机其他应用导入**
  - 只读扫描 Claude Desktop、Cursor、VS Code、Windsurf、Cline、Roo Code、Trae、Claude Code 的 MCP 配置；
  - 选择要导入的服务器，导入后由本页托管；
  - 不修改源文件。
- **左侧栏快捷入口**
  - 页面上一键开关是否在 DSH 左侧栏显示 MCP 图标；
  - 点击图标直接打开独立的 MCP 管理页；
  - 选择保存到 `$DSH_HOME/dsh-mcp-manage/preferences.json`。
- **界面**
  - 跟随 DSH 明暗主题与设计令牌；
  - 原生 `<dialog>` 弹窗、键盘可操作、表单控件带可访问名称；
  - 中英双语，自动跟随 DSH 语言。

## 兼容性

| 项目 | 要求 |
| --- | --- |
| DeepSeek Harness | `>=0.2.2-rc.1 <0.3.0` |
| 运行界面 | Web 与 Desktop（桌面版） |
| 必需组件 | profile 中已挂载 `@deepseek-ai/dsh-mcp-manager`（官方 Web/Desktop 组合默认提供） |
| Node.js | `>=22`（仅随 DSH 运行，无需单独安装） |

系统自带的 MCP 配置扫描路径按 Windows / macOS / Linux 分别适配；没有安装对应应用时会自动跳过。

## 安装

### 从 DSH 图形界面

1. 打开侧栏的 **插件** 页。
2. 点击 **添加插件**。
3. 填入以下任一来源：
   - GitHub 仓库：`github:tachec/dsh-mcp-manage`
   - 本地目录：本仓库的绝对路径
   - 发布到你自己的 npm scope 后，也可填该包名（例如 `@tachec/dsh-mcp-manage`）
4. 安装并启用 bundle，然后重新打开设置面板。

> **注意：** npm 上的 `dsh-mcp-manage` 已被他人预留，**不是本项目**。本项目目前通过 GitHub 或本地目录安装；如果以后发布 npm 包，请使用自己的 scope，并更新这里。

### 使用 CLI

```powershell
dsh plugin --profile web add github:tachec/dsh-mcp-manage
```

> Desktop 的 `desktop` profile 由桌面端托管，CLI 不允许直接修改；请在侧栏的 **插件** 页里安装。

安装后，插件行会出现在侧栏 **插件** 页的插件列表中，标题为 **MCP 管理 / MCP manager**。

## 快速开始

1. 打开 **设置 → MCP**，或点击左侧栏的 **MCP** 图标。
2. 点击 **添加服务器**。
3. 选择传输方式并填写，或切到 **JSON** 直接粘贴配置。
4. 保存后，服务器会立即挂载；它的工具以 `mcp__<服务器名>__<工具名>` 出现在 Agent 的工具列表里，无需重启。

### stdio 示例

| 字段 | 值 |
| --- | --- |
| 名称 | `github` |
| 传输方式 | `stdio` |
| 启动命令 | `npx` |
| 参数（每行一个） | `-y`<br>`@modelcontextprotocol/server-github` |
| 环境变量 | `GITHUB_TOKEN=${credential:GITHUB_TOKEN}` |

### Streamable HTTP 示例

| 字段 | 值 |
| --- | --- |
| 名称 | `web` |
| 传输方式 | `Streamable HTTP` |
| 服务地址 | `https://example.com/mcp` |
| 请求头 | `Authorization: Bearer ${credential:MCP_TOKEN}` |

### JSON 示例

Claude Desktop / Cursor 的格式可以直接粘贴（支持一次添加多个）：

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

也支持：

- DSH 的 `{ "servers": { ... } }` 包装；
- 直接的 `{ "名称": { ... } }` 映射；
- 单个带 `name` / `serverName` 的服务器对象（编辑时可以不写名称）。

`type: "http"` 会被当作 Streamable HTTP；旧的 `sse` 传输不支持，会给出明确提示。

## 页面说明

### 托管服务器

写进 `@deepseek-ai/dsh-mcp-manager` 的 `config.servers`，由 DSH 的设置服务持久化到当前 profile 的 `cordis.patch.yml`。因此：

- 支持新增、编辑、删除、热启停、探测、重启；
- 修改后立即重建对应的 `dsh-mcp-client` 实例；
- 删除只影响当前 profile，不影响其他 profile。

服务器卡片上会显示：

- 连接状态（已连接、连接中、重连中、等待凭据、失败、已停用……）；
- 工具数量与工具名；
- 传输方式、命令 / URL、环境变量、请求头、超时与重连配置；
- 来自基础配置的服务器会标记 **基础配置**，这类服务器可以停用，但不能在页面上删除。

### 静态接入

指直接写在 profile 或插件补丁里的 `@deepseek-ai/dsh-mcp-client` 行，例如某些插件安装器写入的行。它们由 DSH Loader 在启动 / 重载时挂载，不归 MCP 管理器管，所以：

- 本页可以查看状态与工具、启停整行、编辑配置；
- 不能删除；删除需要在对应的 `cordis.patch.yml` 里移除该行，或卸载携带它的插件；
- 如果你希望它享受完整的增删改与探测，可以在本页用相同命令 / URL 新建一个托管服务器（换个名字），再停用静态行。

### 从本机其他应用导入

点击 **从本机其他应用导入** 展开，然后点 **重新扫描**。扫描是只读的，支持：

- Claude Desktop：`claude_desktop_config.json`
- Cursor：`~/.cursor/mcp.json` 等
- VS Code / VS Code Insiders：`mcp.json`
- Windsurf：`mcp_config.json`
- Cline / Roo Code：扩展的 MCP 设置
- Trae：`mcp.json`
- Claude Code：`~/.claude.json`

导入的服务器会变成托管服务器；源配置文件不会被改动。

### 左侧栏快捷入口

页面顶部的 **左侧栏快捷入口** 开关控制是否在 DSH 左侧栏显示 **MCP** 图标：

- 打开：图标出现在侧栏，点击直接打开 MCP 管理页；
- 关闭：图标立即移除；
- 选择写入 `$DSH_HOME/dsh-mcp-manage/preferences.json`，刷新或重启后保持；
- 关闭图标后，仍可从 **设置 → MCP** 进入本页重新打开。

## 数据与写入位置

| 数据 | 位置 |
| --- | --- |
| 托管服务器配置 | 当前 profile 的 `cordis.patch.yml`（`mcp-manager` 行的 `config.servers`） |
| 静态行配置修改 | 当前 profile 的 `cordis.patch.yml`（对应行的覆盖） |
| 左侧栏开关偏好 | `$DSH_HOME/dsh-mcp-manage/preferences.json` |
| 插件自身 | 当前 profile 的插件依赖（由 DSH 插件管理器管理） |

所有修改只影响**当前 profile**，不会跨 profile 同步。

## 安全与隐私

- Host 端只注册一个同源 JSON 路由 `/dsh-mcp-manage/api`，每个请求都经过 DSH 的浏览器会话认证，写请求还要求同源；没有新的端口、没有对外监听。
- 插件**不注册任何模型可见的工具**；所有操作都由用户在设置页触发。
- 页面会以明文展示已配置的环境变量和请求头（这是管理面所必需的）。密钥请使用 `${credential:REF}` 模板，让 DSH 的凭据服务在运行时解析，而不是把明文写进配置。
- 导入功能只读取本机其他应用的配置文件，不写入、不上传。
- 静态行的启停会修改 profile 的插件状态；删除托管服务器会把配置从当前 profile 中移除。

## 已知限制

- 需要 profile 中已组合 `@deepseek-ai/dsh-mcp-manager`；没有它时页面只能查看静态行，不能新增托管服务器。
- Agent 预设（preset）内部的 MCP 行不在本页范围内，只覆盖当前 profile 的全局平面。
- 静态行不能在本页删除；它们属于声明它们的补丁。
- 不支持旧版 `sse` 传输，请使用 Streamable HTTP。
- 没有 OAuth 登录流程；需要鉴权的服务器请通过请求头 / 环境变量模板提供凭据。
- 探测有超时与工具数量上限；超大工具列表会被截断并标注。
- 左侧栏开关是 Host 级偏好，同时在本浏览器缓存一份；不同 DSH 实例 / profile 之间不共享。

## 开发

本插件是**免构建**的普通 DSH bundle：Host 端 `index.js`、浏览器端 `client.js` 直接以源码加载，没有打包步骤。

```text
dsh-mcp-manage/
├── index.js            # Host：认证路由、配置读写、静态行与偏好
├── client.js           # 浏览器：设置页、主面板、对话框、样式
├── cordis.patch.yml    # bundle 行
├── package.json
├── locale/{en,zh}.json # 插件市场展示文案
├── icon.svg
├── test/
│   ├── host-smoke.mjs
│   └── client-render-smoke.mjs
├── README.md
├── README.en.md
├── CHANGELOG.md
└── LICENSE
```

运行测试（无需 DSH 运行）：

```powershell
npm test
```

- `test/host-smoke.mjs`：用 mock Harness 覆盖 Host 路由的快照、新增 / 编辑 / 删除 / 启停 / 探测 / 重启、静态行、JSON 导入、偏好持久化与认证拒绝。
- `test/client-render-smoke.mjs`：用最小 React 替身渲染设置页、主面板、服务器卡片与对话框，检查渲染路径不抛错，并验证样式表在插件重载时被刷新。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)
