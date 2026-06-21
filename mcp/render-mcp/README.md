# Render MCP（通用版）

可在 **任意支持 MCP stdio 的 Agent** 中使用（Claude Desktop、Claude Code、OpenCode、Cline、Windsurf、Continue 等），不依赖 Cursor 插件。

## 两种模式

| 模式 | 环境变量 | 说明 |
|------|----------|------|
| **bridge**（默认） | `RENDER_MCP_MODE=bridge` | stdio 桥接到 Render 官方托管 MCP `https://mcp.render.com/mcp`，**工具最全**（创建服务、Postgres 查询等） |
| **direct** | `RENDER_MCP_MODE=direct` | 本地直连 Render REST API，只读工具（服务/日志/部署/指标），无网络桥接依赖 |

## 前置条件

1. [Render API Key](https://dashboard.render.com/u/settings#api-keys)
2. Node.js ≥ 20

```bash
cd mcp/render-mcp
npm install
```

## 快速接入（任意 Agent）

```json
{
  "mcpServers": {
    "render": {
      "command": "node",
      "args": ["C:/repo/Spark/mcp/render-mcp/bin/render-mcp.mjs"],
      "env": {
        "RENDER_API_KEY": "rnd_xxxxxxxx"
      }
    }
  }
}
```

路径改成你本机仓库绝对路径。API Key 也可只放在系统环境变量里：

```json
{
  "mcpServers": {
    "render": {
      "command": "node",
      "args": ["C:/repo/Spark/mcp/render-mcp/bin/render-mcp.mjs"]
    }
  }
}
```

## 各 Agent 配置位置

| Agent | 配置文件 |
|-------|----------|
| **Cursor** | 项目 `.cursor/mcp.json` 或 `~/.cursor/mcp.json` |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json`（Win） / `~/Library/Application Support/Claude/claude_desktop_config.json`（Mac） |
| **Claude Code** | `claude mcp add render --transport stdio -- node /path/to/mcp/render-mcp/bin/render-mcp.mjs` |
| **VS Code Copilot MCP** | `.vscode/mcp.json` |
| **OpenCode / 其它 stdio MCP** | 各自 `mcp.json`，格式同上 |

### Claude Code 一行命令

```bash
claude mcp add --transport stdio render -- node "C:/repo/Spark/mcp/render-mcp/bin/render-mcp.mjs"
```

并在 shell 环境或 Claude 配置里设置 `RENDER_API_KEY`。

### 仅用 REST（direct 模式）

```json
{
  "mcpServers": {
    "render": {
      "command": "node",
      "args": ["C:/repo/Spark/mcp/render-mcp/bin/render-mcp.mjs"],
      "env": {
        "RENDER_API_KEY": "rnd_xxxxxxxx",
        "RENDER_MCP_MODE": "direct"
      }
    }
  }
}
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `RENDER_API_KEY` | 是 | Render API Key |
| `RENDER_MCP_MODE` | 否 | `bridge`（默认）或 `direct` |
| `RENDER_MCP_URL` | 否 | 托管 MCP 地址，默认 `https://mcp.render.com/mcp` |
| `RENDER_MCP_STATE_DIR` | 否 | workspace 选择状态目录，默认 `~/.config/render-mcp` |

## direct 模式工具列表

- `list_workspaces` / `select_workspace` / `get_selected_workspace`
- `list_services` / `get_service`
- `list_deploys` / `get_deploy`
- `list_logs`
- `get_metrics`

## bridge 模式

与 [Render 官方 MCP](https://render.com/docs/mcp-server) 工具一致（含 `create_web_service`、`query_render_postgres` 等）。

## 与 Cursor 插件的关系

- Cursor 内置 Render 插件 ≈ 连接同一托管端点
- 本包通过 **stdio 桥接**，让其它 Agent 也能用同一套能力
- 若 Agent 已支持 HTTP MCP，也可直接配：

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer ${RENDER_API_KEY}"
      }
    }
  }
}
```

## 本地验证

```bash
cd mcp/render-mcp
set RENDER_API_KEY=rnd_xxx
npm start
# 另开终端用 MCP Inspector 或 agent 连接 stdio
```

## 参考

- [Render MCP 官方文档](https://render.com/docs/mcp-server)
- [render-oss/render-mcp-server](https://github.com/render-oss/render-mcp-server)
