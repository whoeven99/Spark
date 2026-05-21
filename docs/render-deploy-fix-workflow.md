# Render 发布失败：Agent 自动修复流程

当你说「看下 Render 发布失败 / SmartDescriptionTest deploy 挂了」时，Agent 会按 [`.cursor/rules/render-deploy-fix.mdc`](../.cursor/rules/render-deploy-fix.mdc) 执行：

**MCP 查 build 日志 → 改代码 → `npm run build` → commit → push → 再看 deploy 状态**

## 你需要配置的内容

### 1. Render MCP（必做）

在 **用户级** `~/.cursor/mcp.json`（推荐，避免 API Key 进仓库）加入：

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer <你的 Render API Key>"
      }
    }
  }
}
```

API Key：[Render Dashboard → Account Settings → API Keys](https://dashboard.render.com/u/settings#api-keys)

配置后 **完全重启 Cursor**，在 **Settings → MCP** 确认 `render` 为已连接。

### 2. 在对话里启用该规则

两种方式任选：

- **显式触发**：提到「按 Render 发布失败流程 / deploy fix 规则处理」。
- **@ 规则**：在 Agent 输入框用 `@render-deploy-fix`（或 Rules 里勾选 `render-deploy-fix`）。

规则默认 `alwaysApply: false`，避免无关对话也自动 push。

### 3. Git push 权限（必做）

Agent push 需要本机已配置且可用：

- `git` 能 `push` 到远程（SSH key 或 HTTPS credential）
- 当前分支无保护策略阻止 push，或你有 bypass 权限

在 Cursor Agent 执行 push 时，若弹出权限请求，请允许 **git_write** 与 **network**。

### 4. 可选：用户级「发布失败可自动提交」说明

若你全局 User Rule 写了「不要主动 commit」，可在 User Rules 加一句例外：

> 当用户要求排查 Render 发布失败，或触发 `render-deploy-fix` 规则时，允许自动 commit 并 push 修复提交。

## 服务对照表

| 名称 | RENDER_SERVICE_ID | URL |
|------|-------------------|-----|
| Smart Description Test | `srv-d84veasvikkc739fk0f0` | https://smartdescriptiontest.onrender.com |
| Spark Test | `srv-d7j6ogaqqhas739in900` | https://aiassistant-wi7b.onrender.com |

## 限制说明

| 情况 | Agent 行为 |
|------|------------|
| 失败原因在 Render 环境变量 / 套餐 / 数据库 | 会说明需你在 Dashboard 改配置，无法仅靠改代码 |
| `main` 分支保护 + 必须 PR | 可能只能 push 到 feature 分支，需你合并 PR |
| MCP 未连接 | 降级用 API/CLI，仍尽量完成修复 |
| 修复后 CI 仍失败 | 继续读新日志迭代，直到 `live` 或明确阻塞 |

## 安全

- **不要**把 Render API Key 写入仓库的 `mcp.json` 或 commit。
- 项目 `.cursor/mcp.json` 仅保留 Shopify MCP；Render 放用户级配置即可。
