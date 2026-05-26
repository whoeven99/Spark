---
name: Spark 项目代码结构速查
description: Spark 项目的代码框架、目录结构、核心业务流程、常用文件位置等快速参考
type: project
---

# Spark 项目代码结构速查

**简述**：Spark 是一个嵌入式 Shopify 应用，集成 AI Assistant、翻译 V3、商品描述生成、订阅计费等功能。本记忆用于 AI Agent 快速定位文件与理解项目结构。

## 核心功能

1. **AI Assistant**（主页）- LangGraph ReAct Agent，支持：
   - Shopify 商店数据查询与建议
   - 商品描述生成（生成描述工具）
   - 整图翻译（火山 + Aidge 双引擎）
   - 模板邮件发送
   - 翻译表单指引

2. **诊断报告**（`app.additional.tsx`）- 7 天核心指标、健康状态评估

3. **翻译 V3 / JSON Runtime**（`app.translation.tsx`）- 创建任务、查看进度、下载报表
   - 元数据：Azure Cosmos DB
   - 内容：Azure Blob Storage
   - 进度：Redis

4. **生成商品描述**（`app.generate-description.tsx`）- 订阅制+按量计费
   - Token 配额管理（token 池：订阅赠送 + 购包 - 使用）
   - Shopify Billing 集成

5. **图片工具**（`app.image-studio.tsx`）- 整图翻译 + 文生图

## 关键目录速查

| 路径 | 说明 | 改什么时查 |
|------|------|----------|
| `app/routes/` | 页面与 API 路由 | 改页面、改 API 端点 |
| `app/server/ai/` | Agent 链路（图、工具、后处理） | 改聊天、工具、AI 回复 |
| `app/server/generateDescription/` | 商品描述生成 | 改生成描述逻辑 |
| `app/server/translation/` | 翻译 V3 流水线 | 改翻译流程，先读 `docs/translation-agent.md` |
| `app/server/pictureTranslate/` | 整图翻译（火山 + Aidge） | 改图片翻译 |
| `app/server/billing/` | 订阅与计费 | 改计费逻辑，先读 `app/server/billing/agent.md` |
| `app/server/email/` | 邮件（腾讯 SES） | 改邮件模板或场景 |
| `app/server/appLifecycle/` | 安装/卸载运营副作用 | 改 App 生命周期行为 |
| `prisma/` | 数据库 Schema + 迁移 | 改数据库模型 |
| `docs/` | 项目文档 | **改任何核心功能前必读对应文档** |

## 数据存储

- **Prisma Client (Turso)**：Session、Account、AppSubscription、Suggestion、AdPlatformCredential、TokenBillingRule、BillingLog、CommonEventLog
- **Azure Cosmos DB**：翻译任务元数据（translation_jobs）、Agent 运行摘要（agent_runs）
- **Azure Blob Storage**：翻译报表/chunk（translation-content）、图片翻译结果（picturetranslate）、生成图片（generatedimages）
- **Redis**：翻译进度键、监控指标

## 常用路由

| 路由 | 文件 | 功能 |
|------|------|------|
| `/app` | `app/routes/app.tsx` | 应用壳、鉴权入口 |
| `/app/_index` | `app/routes/app._index.tsx` | 首页（聊天） |
| `/app/additional` | `app/routes/app.additional.tsx` | 诊断报告 |
| `/app/translation` | `app/routes/app.translation.tsx` | 翻译页 |
| `/app/generate-description` | `app/routes/app.generate-description.tsx` | 生成描述页 |
| `/app/billing` | `app/routes/app.billing.tsx` | 订阅与计费页 |
| `/app/image-studio` | `app/routes/app.image-studio.tsx` | 图片工具 |
| `POST /chat-stream` | `app/routes/chat-stream.ts` | 聊天 SSE 流 |
| `POST /api/generate-description` | `app/routes/api.generate-description.ts` | 生成描述 API |
| `POST /api/picture-translate` | `app/routes/api.picture-translate.ts` | 整图翻译 API |
| `GET /api/translate/v3/json-runtime-tasks` | `app/routes/api.translate.v3.json-runtime-tasks.ts` | 翻译任务列表 |
| `GET /api/translate/v3/json-runtime-task-detail` | `app/routes/api.translate.v3.json-runtime-task-detail.ts` | 翻译任务详情 |

## AI 工具列表

在 `app/server/ai/skills/index.ts` 中注册：
- `get_current_time` - 获取当前时间
- `get_weather` - 获取天气
- `get_shop_info` - Shopify 店铺信息
- `get_shop_kpis` - 经营指标（销售额、订单、转化等）
- `generate_product_description` - 商品描述生成
- `picture_translate` - 整图翻译
- `send_template_email` - 模板邮件发送（白名单）
- 翻译表单工具（通过 `translationTaskFormExtract` 推断）

## 计费系统核心

- **启用应用**：`BILLING_ENABLED_APPS` 仅含 `generate-description`；主 App `chat` 不扣 token
- **网关**：`BILLING_GATEWAY=noop` 时本地生效（开发）；否则走 Shopify Billing GraphQL
- **Token 池**：`Account.tokenPools` = 订阅赠送 + 购包 - usedTokens
- **校验**：`hasTokenQuota(account)` 判断余额，生成描述 API 调用前校验
- **累加**：`recordBilledTokenUsage()` / `recordVisualToolTokenUsage()` 记录使用
- **Webhook**：`app_subscriptions/update`、`app_purchases_one_time/update` 触发 `activateSubscription` / `applyTokenPackPurchase`

## 翻译系统核心

- **创建任务**：`translationPipelineCore` 写入 Cosmos、Blob、Redis
- **查看任务**：`GET /api/translate/v3/json-runtime-tasks` (Cosmos) 或 `GET /api/translate/v3/json-runtime-task-detail` (Cosmos+Redis+Blob 聚合 或 转发 AgentTask)
- **环境变量**：`COSMOS_*`、`REDIS_*`、`BLOB_TRANSLATE_V3_*`、`JSON_RUNTIME_TASK_DETAIL_SOURCE`（local 或转发）

## 改动前必读文档

- **`docs/PROJECT_CONTEXT.md`** - 架构、路由、环保变量、改动落点指南
- **`docs/translation-agent.md`** - 翻译流程与边界
- **`docs/generateDescription.md`** - 生成描述方案
- **`app/server/billing/agent.md`** - 计费系统详解
- **`docs/UI_DESIGN.md`** - 前端 UI 规范

## 快速诊断

**聊天不工作** → `app/server/chat-stream.ts` → `invokeChatAgent()` → `shopChatGraph` 图 → 检查 Shopify admin 鉴权

**工具不工作** → `app/server/ai/skills/index.ts` 注册 → 工具实现 → LangSmith 链接

**翻译不工作** → 检查 `COSMOS_*`、`REDIS_*`、`BLOB_*` → `translationPipelineCore` 逻辑 → 检查 Cosmos 写入

**计费不工作** → 检查 `BILLING_GATEWAY` → `BILLING_ENABLED_APPS` → Shopify Billing 权限 → `hasTokenQuota()` 返回值

## 开发命令

```bash
npm run dev                    # 本地开发
npm run lint && npm run typecheck && npm run test  # 代码质量检查
npm run build                  # 生产构建
npm run turso:migrate:test     # Turso 迁移（测试库）
```

**改代码后必须运行**：`npm run test` 和 `npm run build`

---

**为什么这份记忆重要**：帮助 AI Agent 快速定位文件、理解项目结构、知道改动前应该读哪份文档，提高代码改动的准确性与质量。
