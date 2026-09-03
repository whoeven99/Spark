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

一级导航由 `app/config/appEntry.server.ts` 定义（点侧栏应用名进 `/app`；prod 另仅「账户与订阅」；测/本地全量子页），应用壳是 `app/routes/app.tsx`。

| 目的地 | URL | 实现 |
| --- | --- | --- |
| 首页（应用入口） | `/app` | `HomeV2Panel` 落地（本页聊天）；由点「Spark」进入，不占 `s-app-nav` 子项；旧 `/app/home-v2` 重定向至此 |
| 助手 | `/app/assistant` | 默认进对话（测环境导航可见） |
| 首页 v1 | `/app/home-v1` | `HomePanel` 经营概览（测环境导航可见） |
| Today | `/app/today` | `app.today._index.tsx`、`app.today.roi.tsx`、`app.today.orders.tsx`、`app.today.traffic.tsx`、`app.today.conversion.tsx` |
| Health Monitor | `/app/health-monitor` | `app.health-monitor.tsx` |
| Studio | `/app/studio` | `app.studio.copy.tsx`、`app.studio.image.tsx`；`app.studio.translate.tsx` 重定向到 copy |
| Tasks | `/app/tasks` | `app.tasks.tsx` + `UnifiedTaskListPage` |
| 账户与订阅 | `/app/account` | `app.account.tsx` + `BillingPage`；旧 `/app/settings/billing` 重定向 |
| Settings | `/app/settings` | 连接、物流、数据、反馈等（计费已迁出） |

React Router 使用 `app/routes.ts` 中的 `flatRoutes()`。新增或改名路由时必须先核对文件名到 URL 的映射。

兼容层约定：

- `app.today.diagnosis.tsx` 是历史深链兼容路由，只负责重定向到 Today、Health Monitor、Tasks 等正式目的地，不再承载正式 UI 或业务逻辑。
- `app.today.insights.tsx` 是历史 Today Insights 兼容路由，只负责跳转到 Today 正式详情页。

## 3. 关键 HTTP 入口

- `POST /chat-stream`：SSE 聊天入口，`app/routes/chat-stream.ts` -> `app/server/chat-stream.ts`。
- `/api/ai-task*`、`/api/batch-ai-tasks`、`/api/unified-tasks`：AI 异步任务、批次、日志与统一任务列表。
- `/api/product-improve`、`/api/product-quality-score`、`/api/update-product-description`、`/api/product-search`、`/api/shop-locales`、`/api/shopify.objects`：商品文案、质量评分、商品/对象查询与写回。
- `/api/generate-image*`、`/api/picture-translate*`：图片生成和图片翻译。
- `/api/conversations*`、`/api/files*`、`/api/context-resources*`：工作台会话和文件上下文。
- `/api/task-proposal`：聊天中的任务建议/确认载荷。
- `/api/automation-overview`：Today 和工作台自动化概览。
- `/api/support`：客服会话入口。
- `/api/feature-track`、`/api/pixel-ingest`：功能埋点与 Web Pixel 采集。
- `/api/ga4/*`、`/api/gsc/*`：Google Analytics 4 与 Search Console。
- `POST /api/pagespeed`：PageSpeed Insights 实验室分析（不落库）。
- 广告 Catalog / Insights OAuth：`app.ads-catalog.tsx`、`app.insights.performance.tsx`（旧路径 `app.settings.ads-insights.tsx` 只做重定向）、`app.ads.*.start.tsx`；回调见 `ads.meta-catalog.callback.tsx`、`ads.meta-ads.callback.tsx`、`ads.google-*.callback.tsx`、`ads.tiktok-catalog.callback.tsx`。
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
| Google Search Console | `app/server/googleSearchConsole/` |
| PageSpeed Insights | `app/server/pageSpeed/` |
| AI 任务和任务估算 | `app/server/aiTask/` |
| 统一任务列表 | `app/server/unifiedTask/` |
| Today、Health Monitor、Tasks、ROI、自动化 | `app/server/operations/`、`app/server/automation/` |
| Shopify 同步和历史回补 | `app/server/shopify/sync/`、`app/routes/app.settings.data.tsx` |
| 计费、订阅、购包、token | `app/server/billing/`、`app/server/tokenUsage/` |
| 会话、文件上下文 | `app/server/conversation/`、`app/server/fileContext/` |
| 支持聊天 | `app/server/support/` |
| 邮件、通知、飞书 | `app/server/email/`、`app/server/notifications/`、`app/server/feishu/` |
| 生命周期和通用事件 | `app/server/appLifecycle/`、`app/server/commonEventLog/` |
| Web Pixel 和 SLS | `app/server/webPixel/`、`app/server/aliyunLog/` |
| Agent 运行摘要 | `app/server/agentRunLog/` |

## 5. 数据和外部系统

- Turso / libSQL + Prisma：主业务数据，schema 在 `prisma/schema.prisma`，运行时入口是 `app/db.server.ts`。广告 OAuth 凭证写入 `AdPlatformCredential`（按 `shop` + `platform` 唯一），读写见 `app/server/adsCatalog/credentialStore.server.ts`；该表的 `externalAccountId` 是从凭证 JSON 派生的索引列，供 GMC / Meta Catalog webhook 反查店铺。
  - 广告洞察落库：`AdEntity`（系列/广告组/广告层级）+ `AdMetricDaily`（广告级每日可加指标）+ `AdInsightsSync`（回源状态），读写见 `app/server/adsInsights/store.server.ts`。`structure` 视图默认读库，快照过期才回源，回源固定拉 30 天，`/api/ads-insights?refresh=1` 强刷。派生指标查询时算；`reach` / `frequency` 不可跨天相加，不入库。
  - 商品审核状态：`GmcProductStatus` / `MetaProductStatus` 按店铺全量重建（`deleteMany` + 分批 `createMany`），拉取需翻完分页。
- Azure Cosmos DB：Agent 运行摘要、Playbook Case，以及 Admin 翻译观测中读取的外部任务数据。
- Azure Blob Storage：上传文件、图片生成、图片翻译和少量兼容翻译内容。
- Redis：与 ciwi-translate（TSF）**共用同一 Render KV**。主应用经 `SPARK_KV` 接入；写入 key 必须带 `spark:` 前缀，禁止碰 TSF 的 `translate:v4:` / `tsf:` / `tm:v5:` 等前缀。Admin 经 `RENDER_KV` 只读观测 TSF key。不作为新核心业务对象的默认存储。
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
- 订单镜像回补：`SPARK_ORDER_BACKFILL_DAYS`（可选，默认 30，范围 1–365）。安装进 `/app` 时 GraphQL 历史回补与设置 › 数据手动回补共用此默认窗口；之后增量靠 Shopify webhook upsert 进同一套 Turso 表（`ShopOrder*` 等），不进 Cosmos/Blob。
- Turso（主应用）：`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`（测/产各自配值）；`DATABASE_URL` 仅 Prisma CLI / 本地 SQLite。
- Turso（Admin）：`SPARK_DATABASE_URL` / `SPARK_DATABASE_AUTH_TOKEN`（Spark 库）；
  `TSF_DATABASE_URL` / `TSF_DATABASE_AUTH_TOKEN`（翻译库）；测/产分服务配值，无 TARGET。
- AI：`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`，以及对应模型/base URL 变量；商品质量评分的图片维度使用独立密钥 `DEEPSEEK_VISION_KEY` 与模型 `DEEPSEEK_VISION_MODEL`（默认 `deepseek-v4-flash-vision-exp`）。
- Cosmos / Blob / Redis：按功能读取 `COSMOS_*`、`AZURE_BLOB_*`、`BLOB_TRANSLATE_V3_*`；主应用 Render KV 用 `SPARK_KV`（与 TSF **共用同一实例** 时也走此变量）；Admin Redis 优先 `RENDER_KV`（与 TSF 同名；兼容 `REDIS_URL`）。主应用 key 必须以 `spark:` 开头，避免与 TSF 冲突。
- 图片翻译：`HUOSHAN_*` / `VOLC_*`、`AIDGE_*`、`PICTURE_TRANSLATE_*`。
- 图片生成：`AZURE_BLOB_GENERATED_IMAGES_CONTAINER`、`IMAGE_GEN_BLOB_SAS_TTL_MINUTES`。
- Billing：`BILLING_GATEWAY`、`BILLING_TEST`、`BILLING_ENABLED`；营销领 Token（账户页）可选 `SPARK_PROMO_ENABLED` / `SPARK_PROMO_CAMPAIGN_ID` / `SPARK_PROMO_TOKEN_AMOUNT` / `SPARK_PROMO_STARTS_AT` / `SPARK_PROMO_ENDS_AT`；翻译迁入积分内部接口 `CREDIT_MIGRATION_SECRET`（HMAC，与 TSF `SPARK_CREDIT_MIGRATION_SECRET` 相同）。
- 邮件和飞书：`TENCENT_*`、`EMAIL_*`、`OPS_NOTIFY_EMAIL`、`FEISHU_*`。
- Partner API 卸载反馈：`SHOPIFY_PARTNER_API_TOKEN`、`SHOPIFY_PARTNER_ORGANIZATION_ID`、`SHOPIFY_PARTNER_APP_ID`。
- 广告 Meta：`META_APP_ID`、`META_APP_SECRET`（兼容 `META_OAUTH_CLIENT_*`）。
- PageSpeed Insights：仅走 Google PSI API v5；可选平台级 `GOOGLE_PAGESPEED_API_KEY`（不是商户 OAuth）。
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
- 改广告 OAuth / Catalog / Insights：`app/server/adsCatalog/**`、`app/server/adsInsights/**`、相关 `app/routes/app.ads-catalog.tsx`、`app.insights.*` 与 OAuth start/callback。
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
