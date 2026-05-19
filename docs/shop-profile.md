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

免费/低配 Cosmos 账户常有**账户级 RU 上限**（例如 1000 RU/s）。代码**不会**再自动创建 `shop_profiles` 容器，以免 `createIfNotExists` 为第二容器分配吞吐量导致 400 错误（substatus 1028）。

- **默认**：画像写入已有 `agent_runs` 容器（`id: profile`，`ttl: -1` 免 90 天过期）。
- **若曾设** `COSMOS_SHOP_PROFILES_CONTAINER=shop_profiles`：请删除该环境变量并重新部署；或在 Portal 删除未建成功的容器配置。

## 后续扩展

见 `docs/shop-insight-agent-roadmap.md`（经营指标、广告 API、LLM 蒸馏等）。
