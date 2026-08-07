# Spark 项目上下文

本文档记录 Spark 当前代码事实和长期约定。若本文档、README、旧设计文档与代码冲突，优先级为：当前代码与配置 > `package.json` / `prisma/schema.prisma` > 根目录 `AGENTS.md` > 本文档。

## 1. 项目定位

Spark 是嵌入 Shopify Admin 的 AI 运营应用，当前由四块组成：

- 主应用：仓库根目录，React 18、React Router 7 文件路由、Vite、Shopify App Bridge / Web Components、Node 服务端。
- Admin 后台：`admin/` 独立 Express API + Vite React 前端。
- Web Pixel 扩展：`extensions/ciwi-spark-web-pixel/`，采集 Shopify analytics/custom events 并上报 `/api/pixel-ingest`。
- Theme App Extension：`extensions/spark-tiktok-pixel/`，店面 App embed 注入 TikTok `ttq`；Pixel / Events API 配置在 Ads Catalog，经 Shop metafield `spark_tiktok.pixel_config` 下发。

整店/多语言翻译执行链路归 TypeScriptFrontend（TSF）所有。Spark 主应用不再注册整店翻译工具，也没有 `worker/` 目录或 Translation Worker 可部署服务。Spark 仍保留图片翻译、兼容 Blob 读取和 Admin 只读观测/运维页。

## 2. 主应用信息架构

一级导航由 `app/config/appEntry.server.ts` 定义，应用壳是 `app/routes/app.tsx`。

| 目的地 | URL | 实现 |
| --- | --- | --- |
| Ask | `/app` | `app._index.tsx` + `page/workspace/WorkspaceAppShellPage.tsx` |
| Today | `/app/today` | `app.today._index.tsx`、`app.today.diagnosis.tsx`、`app.today.orders.tsx` |
| Studio | `/app/studio` | `app.studio.copy.tsx`、`app.studio.image.tsx`；`app.studio.translate.tsx` 重定向到 copy |
| Tasks | `/app/tasks` | `app.tasks.tsx` + `UnifiedTaskListPage` |
| Settings | `/app/settings` | `billing`、`channels`、`logistics`、`data`、`feedback` |

React Router 使用 `app/routes.ts` 中的 `flatRoutes()`。新增或改名路由时必须先核对文件名到 URL 的映射。

## 3. 关键 HTTP 入口

- `POST /chat-stream`：SSE 聊天入口，`app/routes/chat-stream.ts` -> `app/server/chat-stream.ts`。
- `/api/ai-task*`、`/api/batch-ai-tasks`、`/api/unified-tasks`：AI 异步任务、批次、日志与统一任务列表。
- `/api/product-improve`、`/api/product-quality-score`、`/api/update-product-description`、`/api/product-search`、`/api/shop-locales`、`/api/shopify.objects`：商品文案、质量评分、商品/对象查询与写回。
- `/api/generate-image*`、`/api/picture-translate*`：图片生成和图片翻译。
- `/api/conversations*`、`/api/files*`、`/api/context-resources*`：工作台会话和文件上下文。
- `/api/task-proposal`：聊天中的任务建议/确认载荷。
- `/api/automation-overview`：Today 和工作台自动化概览。
- `/api/support`、`/api/external-support`：客服会话入口。
- `/api/feature-track`、`/api/pixel-ingest`：功能埋点与 Web Pixel 采集。
- 广告 Catalog / Insights OAuth：`app.ads-catalog.tsx`、`app.settings.ads-insights.tsx`、`app.ads.*.start.tsx`；回调见 `ads.meta-catalog.callback.tsx`、`ads.meta-ads.callback.tsx`、`ads.google-*.callback.tsx`、`ads.tiktok-catalog.callback.tsx`。
- TikTok 店面测试事件双发：`POST /api/ads-catalog/tiktok-storefront-track`（仅测试模式）。
- `webhooks.*.tsx`：Shopify 卸载、scope、订阅、购包、订单、退款、库存、履约 Webhook。

## 4. 服务端领域入口

| 领域 | 入口 |
| --- | --- |
| 聊天、Agent 图、Tool Registry | `app/server/chat-stream.ts`、`app/server/ai/core/`、`app/server/ai/skills/` |
| Playbook 与 Case | `app/server/ai/playbooks/`、`app/server/playbookCase/` |
| 商品文案与商品质量 | `app/server/productImprove/`、`app/server/ai/skills/productOptimization/` |
| 商品目录和 Shopify 对象 | `app/server/productSearch/`、`app/server/shopify/` |
| 图片生成 | `app/server/imageGeneration/`、`app/server/ai/skills/imageGeneration/` |
| 图片翻译 | `app/server/pictureTranslate/`、`app/server/ai/skills/pictureTranslate/` |
| 广告 Catalog / Insights | `app/server/adsCatalog/`、`app/server/adsInsights/` |
| AI 任务和任务估算 | `app/server/aiTask/` |
| 统一任务列表 | `app/server/unifiedTask/` |
| Today、诊断、ROI、自动化 | `app/server/operations/`、`app/server/automation/` |
| Shopify 同步和历史回补 | `app/server/shopify/sync/`、`app/routes/app.settings.data.tsx` |
| 计费、订阅、购包、token | `app/server/billing/`、`app/server/tokenUsage/` |
| 会话、文件上下文 | `app/server/conversation/`、`app/server/fileContext/` |
| 支持聊天 | `app/server/support/` |
| 邮件、通知、飞书 | `app/server/email/`、`app/server/notifications/`、`app/server/feishu/` |
| 生命周期和通用事件 | `app/server/appLifecycle/`、`app/server/commonEventLog/` |
| Web Pixel 和 SLS | `app/server/webPixel/`、`app/server/aliyunLog/` |
| Agent 运行摘要 | `app/server/agentRunLog/` |

## 5. 数据和外部系统

- Turso / libSQL + Prisma：主业务数据，schema 在 `prisma/schema.prisma`，运行时入口是 `app/db.server.ts`。广告 OAuth 凭证写入 `AdPlatformCredential`（按 `shop` + `platform` 唯一），读写见 `app/server/adsCatalog/credentialStore.server.ts`。
- Azure Cosmos DB：Agent 运行摘要、Playbook Case，以及 Admin 翻译观测中读取的外部任务数据。
- Azure Blob Storage：上传文件、图片生成、图片翻译和少量兼容翻译内容。
- Redis：Admin 运营排查和部分历史/兼容状态读取，不作为新核心业务对象的默认存储。
- Aliyun SLS：Pixel、访问与功能行为日志。
- Shopify Admin GraphQL / Billing：店铺数据、写回、订阅与一次性购包。
- 腾讯 SES / 飞书：商户邮件与内部运营通知，通知失败通常不阻断主流程。
  - 发送入口：`app/server/email/`（`sendTemplateEmail`）+ `app/server/notifications/`（`notify*Email` → `dispatchMerchantNotificationEmail`）。
  - 商户模板 ID：`notificationTemplateIds.server.ts`（安装 `180498`、卸载 `180499`、购包 `180500`、订阅 `180501–180503`）；Agent `task_*` 模板仍在 `emailTemplates.server.ts`。
  - 触发：安装（`recordAppInstalled` → `onAppInstalled`）、卸载（`onAppUninstalled`，删 Session 前读收件人快照）、订阅/购包（`activateSubscription` / `applyTokenPackPurchase`）。
  - 模板展示用 support 邮箱：`MERCHANT_SUPPORT_EMAIL`（`support@ciwi.ai`），与 SES From（`support@msg.ciwi.ai`）分离。
- 物流承运商凭证：本地 JSON `.data/logistics-provider-credentials.json`（`app/server/logisticsCredentialStore.server.ts`），未做加密存储。

存储设计默认遵守：业务对象与遥测分离；先复用现有 store/service；涉及整店翻译时同时核对 TSF 当前实现。

## 6. Admin 后台

Admin 是独立项目，不能假设根目录命令会检查它。

```powershell
cd admin
npm run dev
npm run build
```

- API 入口：`admin/server/index.ts`、`admin/server/routes/`。
- 前端入口：`admin/src/App.tsx`、`admin/src/pages/`、`admin/src/api.ts`。
- 存储连接：`admin/server/lib/`。
- 鉴权：`admin/server/middleware/auth.ts`；收入、Pixel checkout PII、TSF billing/ROI 等 owner-only 路由在 `admin/server/index.ts` 使用 `requireOwner`。
- 翻译相关 Admin 页面是 TSF/外部存储的观测和运维边界，不代表 Spark 主应用拥有整店翻译 Worker。

## 7. 运行、构建和迁移

根目录常用命令：

```powershell
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run turso:migrate:test
```

补充：

- Node 版本以 `package.json` 为准：`>=20.19 <22 || >=22.12`。
- `npm run dev` 包装 Shopify CLI，需要 Shopify CLI 登录和应用配置。
- Turso 迁移使用 `npm run turso:migrate:test` / `npm run turso:migrate:prod`，不要把 `prisma migrate deploy` 直接指向 `libsql://`。
- 修改 Prisma schema 后至少运行 `npx prisma generate`，并按风险执行 typecheck/build/test。
- 不读取或输出 `.env` / `.env.prod` 的值。只记录变量名和用途。

## 8. 关键环境变量分组

- Shopify：`SHOPIFY_API_KEY`、`SHOPIFY_API_SECRET`、`SCOPES`、`SHOPIFY_APP_URL`。
- Turso：`TURSO_TARGET`、`TURSO_TEST_DATABASE_URL`、`TURSO_TEST_AUTH_TOKEN`、`TURSO_PROD_DATABASE_URL`、`TURSO_PROD_AUTH_TOKEN`、`DATABASE_URL`。
- AI：`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`，以及对应模型/base URL 变量。
- Cosmos / Blob / Redis：按功能读取 `COSMOS_*`、`AZURE_BLOB_*`、`BLOB_TRANSLATE_V3_*`；Admin Redis 优先 `RENDER_KV`（与 TSF 同名；兼容 `REDIS_URL`）。
- 图片翻译：`HUOSHAN_*` / `VOLC_*`、`AIDGE_*`、`PICTURE_TRANSLATE_*`。
- 图片生成：`AZURE_BLOB_GENERATED_IMAGES_CONTAINER`、`IMAGE_GEN_BLOB_SAS_TTL_MINUTES`。
- Billing：`BILLING_GATEWAY`、`BILLING_TEST`、`BILLING_ENABLED`。
- 邮件和飞书：`TENCENT_*`、`EMAIL_*`、`OPS_NOTIFY_EMAIL`、`FEISHU_*`。
- Partner API 卸载反馈：`SHOPIFY_PARTNER_API_TOKEN`、`SHOPIFY_PARTNER_ORGANIZATION_ID`、`SHOPIFY_PARTNER_APP_ID`。
- 广告 Meta：`META_APP_ID`、`META_APP_SECRET`（兼容 `META_OAUTH_CLIENT_*`）。
- TikTok Pixel（Ads Catalog）：
  - UI：`/app/ads-catalog` TikTok 面板；店面 Theme App Embed 读 Shop metafield `spark_tiktok.pixel_config`。
  - 测试事件：保存 / Go to Online Store 时写入 `testEventCode` + `storefrontTrackUrl`；店面浏览/加购经公开端点双发 Events API；删除后恢复正式事件。
  - 服务端：`orders/paid` 按勾选上报 `CompletePayment`（Events API `pixel/track`；凭证含 Test Event Code 时带 `test_event_code`）。
- TikTok Insights 沙盒（`app/server/adsInsights/tiktokSandbox.server.ts`）：
  - `TIKTOK_SANDBOX_ACCESS_TOKEN`、`TIKTOK_SANDBOX_ADVERTISER_ID`（必需）
  - `TIKTOK_SANDBOX_IDENTITY_ID`、`TIKTOK_SANDBOX_IDENTITY_TYPE`（seed 建 Ad 必需）
  - `TIKTOK_SANDBOX_ACCOUNT_NAME`、`TIKTOK_SANDBOX_IMAGE_ID`（可选）
  - 请求 `sandbox-ads.tiktok.com`，不复用 Catalog OAuth token；Insights 指标为本地 mock。

## 9. 改动落点

- 改聊天 UI：`app/routes/page/workspace/`、`app/routes/component/chat/`。
- 改聊天行为/工具：`app/server/chat-stream.ts`、`app/server/ai/core/`、`app/server/ai/skills/index.ts`。
- 加 AI Skill / Tool / Playbook：先读 `docs/ROADMAP.md`，再改 registry、schema、service、计费、任务卡片和测试。
- 改商品文案：`app/routes/app.studio.copy.tsx`、`app/routes/page/ProductImprovePage.tsx`、`app/server/productImprove/`。
- 改图片工具：`app/routes/app.studio.image.tsx`、`app/server/imageGeneration/`、`app/server/pictureTranslate/`。
- 改 Today/运营诊断：`app/routes/app.today.*`、`app/server/operations/`。
- 改订单回补/数据同步：`app/routes/app.settings.data.tsx`、`app/server/shopify/sync/`。
- 改广告 OAuth / Catalog / Insights：`app/server/adsCatalog/**`、`app/server/adsInsights/**`、相关 `app/routes/app.ads-catalog.tsx`、`app.settings.ads-insights.tsx` 与 OAuth start/callback。
- 改 TikTok Pixel / Theme App Embed：`extensions/spark-tiktok-pixel/`、`app/server/adsCatalog/`（metafield 下发与 Events API）。
- 改计费：先读 `app/server/billing/agent.md`，再改 `app/server/billing/`、`app/server/tokenUsage/`、`app/routes/app.settings.billing.tsx` 和 Webhook。
- 改 Admin：在 `admin/` 内修改并运行 `npm run build`。
- 改 Web Pixel：`extensions/ciwi-spark-web-pixel/`，同时检查 `/api/pixel-ingest`。

## 10. 验证原则

先跑与改动相关的聚焦检查，再按风险决定是否跑完整门禁：

- 纯文档：检查路径和 `git diff --check`。
- 前端页面/i18n：`npm run typecheck` + `npm run build`，必要时浏览器验证。
- 服务端/API/计费/任务状态：相关测试 + `npm run typecheck` + `npm run build`。
- Admin：`cd admin && npm run build`。
- Prisma：`npx prisma generate` + 相关测试 + typecheck/build。
