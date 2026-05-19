# 店铺画像（Shop Profile）

安装应用或 OAuth 完成后，从 Shopify Admin API 读取**店铺基础信息**，写入 Cosmos + Blob，供 AI Assistant 在 system prompt 中引用。

## 存储

| 层 | 位置 | 说明 |
|----|------|------|
| Cosmos | 库 `spark_ops`，**默认与 `agent_runs` 同容器**（避免新建容器超出账户 RU 配额） | partition `/shop`，`id: profile`，`docType: shop_profile`，`ttl: -1` |
| Blob | 容器 `spark-shop-profiles`（`SHOP_PROFILE_BLOB_CONTAINER`） | 路径 `shops/{shop}/profile.md` |

Blob 未配置时，将 `profile.md` 全文存入 Cosmos 字段 `profileMarkdownInline`。

## 环境变量

与 `agent_runs` 共用：`COSMOS_ENDPOINT`、`COSMOS_KEY`。

| 变量 | 默认 | 说明 |
|------|------|------|
| `SHOP_PROFILE_ENABLED` | 启用 | `false` / `0` 关闭 |
| `COSMOS_SHOP_PROFILES_CONTAINER` | 同 `agent_runs` | 勿设 `shop_profiles` 除非已在 Azure 手动建容器且用共享吞吐量 |
| `SHOP_PROFILE_BLOB_CONTAINER` | `spark-shop-profiles` | Blob 容器 |
| `SHOP_PROFILE_BLOB_CONNECTION_STRING` | 同翻译 Blob | 可复用 `AZURE_BLOB_CONNECTION_STRING` |
| `SHOP_PROFILE_MARKDOWN_MAX_CHARS` | `6000` | 注入 prompt 的 MD 上限 |

## 触发时机

1. **新安装**（`recordAppInstalled` 写入 `APP_INSTALLED`）：`auth.$.tsx`、`app.tsx` 异步 `bootstrapShopProfile`
2. **已有安装但无画像**：进入 `/app` 时 `ensureShopProfile` 兜底

## 代码

- `app/server/shopProfile/` — 拉取、构建、读写、加载
- `app/server/chat-stream.ts` — `loadShopProfileForPrompt` 注入 `AgentContext.profile`
- `app/server/ai/core/shopAssistantPrompt.ts` — 拼接【商店画像】

## Cosmos RU 配额说明

免费/低配 Cosmos 账户常有**账户级 RU 上限**（例如 1000 RU/s）。

- 店铺画像**绝不**调用 `containers.createIfNotExists`，只连接已有 **`agent_runs`** 容器。
- `COSMOS_SHOP_PROFILES_CONTAINER` 若指向其他容器名会被**忽略**（并打 warn 日志）。
- Cosmos upsert 失败（RU 超限、容器不存在）时：若已配置 Blob，仍视为 **bootstrap ok**，聊天从 Blob 读 `profile.md`。
- 建议配置 **`AZURE_BLOB_CONNECTION_STRING`**（或 `SHOP_PROFILE_BLOB_CONNECTION_STRING`），作为 Cosmos 不可用时的可靠存储。
- 可选：设 `COSMOS_SPARK_OPS_AUTO_CREATE=false`，Agent Run 也不再自动建容器（须事先在 Portal 建好 `agent_runs`）。

## 后续扩展

见 `docs/shop-insight-agent-roadmap.md`（经营指标、广告 API、LLM 蒸馏等）。
