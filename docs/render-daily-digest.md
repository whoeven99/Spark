# Render 日志日报（GitHub Actions → 飞书）

每日从 **Render Test 服务**拉取应用/请求/构建日志（**北京时间昨日 00:00–24:00**），筛选错误与超时，按类别归因后：

1. 写入仓库 `reports/render-digest-YYYY-MM-DD.{md,json}`（CI Artifact 保留 30 天）
2. 通过 **飞书自定义机器人 Webhook** 推送摘要

## Workflow

- 文件：`.github/workflows/render-daily-log-digest.yml`
- 定时：每天 **北京时间 08:30**（GitHub cron 为 UTC `00:30`）
- 手动：`skip_feishu` 选 **true** 只生成 Artifact、不发飞书；`lookback_hours` 仅调试（留空 = 昨日北京日历日）
- 展示名：在 workflow 里设 `RENDER_SERVICE_DISPLAY_NAME`（与 `RENDER_SERVICE_ID` 并列）

## GitHub Secrets（Environment: `CommonShopifyRenderConfig`）

| Secret | 必填 | 说明 |
|--------|------|------|
| `RENDER_APIKEY` | 是 | 已有；与部署 workflow 相同 |
| `FEISHU_WEBHOOK_URL` | 是* | 飞书群机器人 Webhook 完整 URL |
| `RENDER_OWNER_ID` | **一般不用填** | 见下文 |

\* 本地调试可设 `DIGEST_SKIP_FEISHU=true` 跳过。

### `RENDER_OWNER_ID` 是什么？

Render 拉日志接口 `GET /v1/logs` **必须**带 `ownerId`，表示这条日志属于哪个 **Workspace（工作区）**，不是某台服务的 id。

| 概念 | 示例 | 用途 |
|------|------|------|
| **Service ID** | `srv-d7j6ogaqqhas739in900` | 你的 Web 服务，workflow 里已写死 |
| **Owner ID** | 多为 `tea-xxxxxxxx` 或 `usr-xxxxxxxx` | 工作区 id，查日志 API 必填 |

脚本会先用 `RENDER_SERVICE_ID` 调 `GET /v1/services/{serviceId}`，从返回里读出 `ownerId`。**多数情况下不必单独配 Secret。**

只有自动解析失败时（API 返回结构变化、权限不足等），才到 [Render Dashboard](https://dashboard.render.com) → 账户/团队设置或浏览器开发者工具里看 Workspace id，手动写入 `RENDER_OWNER_ID`。

## 飞书机器人配置

1. 飞书群 → 设置 → 群机器人 → 添加自定义机器人
2. 复制 Webhook 地址，填入 GitHub Secret `FEISHU_WEBHOOK_URL`
3. 安全设置可选「自定义关键词」，关键词需出现在标题中（默认含 `Spark Render 日报`）

## Render API 限流（429）

日志接口有频率限制。脚本已默认：

- **串行** 3 类查询（app error / request 5xx / build），不再 `Promise.all` 并行
- 查询间隔 `DIGEST_QUERY_DELAY_MS`（默认 2500ms）、分页间隔 `DIGEST_PAGE_DELAY_MS`（默认 600ms）
- 遇 **429** 按 `Retry-After` 或指数退避重试（最多 6 次）
- 每类最多 `DIGEST_MAX_PAGES=8` 页（约 800 条/类）

仍 429 时可加大间隔，或在 workflow 里设置：

```yaml
env:
  DIGEST_QUERY_DELAY_MS: "4000"
  DIGEST_PAGE_DELAY_MS: "1000"
  DIGEST_MAX_PAGES: "5"
```

## 本地运行

```bash
export RENDER_API_KEY=...
export RENDER_SERVICE_ID=srv-d7j6ogaqqhas739in900
export FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...
# 可选
export RENDER_OWNER_ID=tea-...
export DIGEST_SKIP_FEISHU=true   # 或 1 / yes
export RENDER_SERVICE_DISPLAY_NAME="Spark Test"
# 调试才用：export DIGEST_LOOKBACK_HOURS=24

node scripts/render-daily-log-digest.cjs
```

## 归因类别

| 类别 | 典型匹配 |
|------|----------|
| 部署/构建失败 | `type=build`、deploy failed |
| HTTP 5xx | 请求日志 status 5xx |
| 超时 | timeout、Timed out |
| AI 聊天 Agent | `Chat agent error` |
| 生成商品描述 | `[GenerateDescription]`、`outcome":"error"` |
| 整图翻译 | `[PictureTranslate]` |
| AgentRunLog | `[AgentRunLog]` |
| 计费/配额 | billing、402 |
| Cosmos/Redis/DB | COSMOS、Redis、Turso |
| 鉴权/Session | authenticate、shop 不一致 |

完整规则见 `scripts/render-log-classify.cjs`。

## 与 AgentRunLog（Cosmos）的关系

本日报 **仅使用 Render 平台日志 API**，不依赖 `spark_ops` Cosmos。后续若需合并 `agent_runs` 昨日 `error/timeout`，可在同一脚本中扩展（待定）。
