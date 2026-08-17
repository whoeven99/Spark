# AGENTS.md

本文件是 Codex 在 `Spark` 仓库中的强制入口和长期维护的代码导航。它适用于仓库根目录及所有子目录；若某个子目录以后新增更具体的 `AGENTS.md`，则子目录文件在其作用域内优先。

## 0. 每次任务必须先做

任何开发、排错、评审、规划、运行命令或文件定位开始前，必须：

1. 从头到尾完整读取当前 `AGENTS.md`，不能只依赖对话中附带的旧副本或历史记忆。
2. 完整读取并遵循 `.cursor/skills/deliberate-collab/SKILL.md`（Claude 风格协作：先确认技术选型，再给实现方案与 UI 样例，再动手；详见该 skill）。
3. 执行 `git status --short`，识别并保护用户已有改动和未跟踪文件。
4. 根据“必读文档路由”读取与任务直接相关的文档。
5. 用 `rg` / `rg --files` 核对真实调用链和文件是否仍存在，再制定方案或修改代码。
6. 修改后按“验证矩阵”执行与风险匹配的检查，并如实报告未执行或被环境阻塞的项目。

若本文件、旧文档和当前代码冲突，优先级为：**当前代码与配置 > `package.json` / Prisma schema > 本文件 > 领域文档 > README**。发现漂移时，应在本次改动范围内同步更新本文件或对应文档。

## 1. 项目现状

Spark 是嵌入 Shopify Admin 的 AI 运营应用，当前仓库有两个可独立运行的应用和 Shopify 扩展：

- **主应用（仓库根目录）**：React 18、React Router 7 文件路由、Vite、Shopify App Bridge / Web Components、Node 服务端，默认由 Shopify CLI 启动。
- **Admin 后台（`admin/`）**：Express API（本地默认 `3099`）+ Vite React 前端（本地默认 `5174`）。它有独立的 `package.json`、依赖和构建流程。
- **Web Pixel 扩展（`extensions/ciwi-spark-web-pixel/`）**：采集 Shopify analytics/custom events，经主应用 `/api/pixel-ingest` 上报。
- **Theme App Extension（`extensions/spark-tiktok-pixel/`）**：受 Shopify 单应用 Theme Extension 数量上限约束（每应用仅 1 个），同一扩展包内包含相互隔离的 App Embed：TikTok Pixel、Google Remarketing、Ciwi Image Switcher。TikTok 配置经 `spark_tiktok.pixel_config` 下发；Google 再营销/转化配置经 app-owned Shop metafield `google_remarketing_config` 下发（含 `tagId`=AW-数字、可选 `conversionLabel`、`enhancedConversions`，配置了 label 时店面事件按 `send_to=AW-ID/label` 上报为 Google Ads 转化），并受 Customer Privacy API 营销同意门禁控制；Image Switcher 经 App Proxy 做图片替换与 IP 地区跳转。不要再新增第二个 `type = "theme"` 扩展目录。Google Pixel 三步向导入口在 `/app/ads/google-pixel`（Nabu 风格：添加像素 / 开启 App Embed / 创建像素），App Embed 启用状态经 `read_themes` 读取主题 `config/settings_data.json` 检测。

重要边界：

- 当前仓库**没有 `worker/` 目录或 Translation Worker 可部署服务**。
- 整店/多语言翻译任务及共享翻译核心归 TypeScriptFrontend（TSF）所有；`app/server/ai/skills/index.ts` 不再注册整店翻译工具，Spark 也不再保存翻译规则或 Worker 实现副本。
- Spark 内仍有**图片翻译**功能，以及 `app/server/translation/translateBlobStore.server.ts` 等少量兼容清理、Admin 只读观测代码。`/app/studio/translate` 当前只重定向到 `/app/studio/copy`，不要把图片翻译、兼容 Blob 读取或 Admin 运维页误判为整店翻译运行时。
- Shopify 订单、退款、客户、库存、履约同步在主应用 `app/server/shopify/sync/` 与 Webhook 中实现；历史订单回补入口是 `/app/settings/data`，不是独立 worker。
- 工作树中可能出现 `tmp-*` / `scripts/tmp-probe-*` 等未跟踪的临时排查脚本；除非用户明确要求，禁止删除、覆盖或纳入改动。

## 2. 仓库地图

```text
Spark/
├─ app/
│  ├─ routes/                 React Router 页面、API、Webhook；flatRoutes 自动发现
│  │  ├─ page/                页面级组合与 workspace UI
│  │  └─ component/           按业务域拆分的可复用组件
│  ├─ server/                 服务端业务、AI、存储和外部集成
│  ├─ config/                 运行时与应用入口配置
│  ├─ hooks/ + lib/           前端 hooks、共享类型、feature track、表单 payload
│  ├─ i18n/ + locales/        i18next 配置及中英文资源
│  ├─ styles/                 全局样式入口（`app.css`）
│  ├─ generated/prisma/       Prisma 生成物，不手工编辑
│  ├─ db.server.ts            Prisma + libSQL/Turso 连接
│  ├─ shopify.server.ts       Shopify 鉴权和 Admin API 初始化
│  ├─ routes.ts               @react-router/fs-routes 入口
│  └─ root.tsx                React Router 根组件
├─ admin/                     独立 Express + Vite 管理后台
├─ extensions/                Shopify 扩展：Web Pixel + Theme（TikTok / Google Remarketing / Image Switcher）
├─ prisma/                    schema、迁移和计费种子 SQL
├─ tests/                     与 app/ 大体镜像的 Vitest 测试
├─ scripts/                   运维、Turso、部署、飞书文档等脚本
├─ docs/                      架构、交互、设计、路线图和运营文档
├─ public/                    静态资源（favicon、workbench demo）
├─ translation-reports/       翻译运维报告输出目录（产物，非源码）
├─ .github/workflows/         部署工作流
├─ mcp/                       本地 MCP 服务器（render-mcp、tiktok-mcp，独立 package）
├─ .codex/config.toml         仓库级 Codex MCP 配置（另见根 `.mcp.json` 通用 MCP 配置）
└─ package.json               主应用命令和依赖的事实来源
```

不要手工编辑 `build/`、`.react-router/`、`coverage/`、`node_modules/`、`admin/dist/` 或 `app/generated/prisma/`。

## 3. 当前信息架构与入口

`app/routes/app.tsx` 是嵌入式应用壳和鉴权入口。一级导航由 `app/config/appEntry.server.ts` 定义，当前固定为：

| 目的地 | URL | 主要实现 |
|---|---|---|
| Ask | `/app` | `app._index.tsx` → `page/workspace/WorkspaceAppShellPage.tsx`，聊天与上下文工作台 |
| Today | `/app/today` | `app.today.*`，`_index` 概览、`diagnosis` 每日诊断/ROI、`orders` 订单风险 |
| Studio | `/app/studio` | `app.studio.*`，`copy` 商品文案，`image` 图片生成/图片翻译；`translate` 旧入口重定向到 `copy` |
| Insights | `/app/insights` | `app.insights.*`：`_index` 跨平台广告总览（读库聚合，见 `adsInsights/overview.server.ts`）、`performance` 投放明细；只读页面，授权与同步仍在 Ads Catalog。旧路径 `/app/settings/ads-insights` 重定向到 `performance` |
| Tasks | `/app/tasks` | `app.tasks.tsx` + `UnifiedTaskListPage` |
| Settings | `/app/settings` | `app.settings.*`：`billing` 计费、`ads-create`/`ads-edit` 广告投放、`logistics` 物流、`google-analytics` GA4、`google-search-console` GSC、`pagespeed` PageSpeed Insights、`data` 历史回补、`feedback` 反馈；`/app/ads-catalog` 为 Ads Catalog 可路由入口（Settings hub 内链，不占一级导航） |

Settings hub 之外还有若干可路由但不在 hub 卡片里的嵌入式页面：`/app/logistics/fedex/config`、`/app/logistics/sf/config`（承运商凭证表单，由 `app.settings.logistics.tsx` 内链）、`/app/feedback/suggestion`、`/app/ads/google-ads/start`、`/app/ads/google-merchant/start`（OAuth 启动页）。

关键 HTTP 入口：

- `POST /chat-stream`：`app/routes/chat-stream.ts` → `app/server/chat-stream.ts`，SSE 聊天入口。
- `/api/ai-task*`、`/api/batch-ai-tasks`、`/api/unified-tasks`：异步任务创建、状态、日志与统一列表。
- `/api/product-improve`、`/api/product-quality-score`、`/api/update-product-description`、`/api/product-search`、`/api/shop-locales`、`/api/shopify/objects`：商品内容优化、对象/商品查询与语言数据。
- `/api/generate-image*`、`/api/picture-translate*`、`/api/image-proxy`：图片生成（含 `generate-image-prompt`）、图片翻译（含 `picture-translate-chat`）与图片代理读取。
- `/api/ads-catalog*`、`/api/ads-create*`、`/api/ads-edit*`、`/api/ads-insights*`、`/api/ads-overview`（含 `link-status` GMC↔Ads 关联探测）：广告 Catalog（Meta/Google/TikTok OAuth、目录同步、TikTok Pixel/测试事件）、广告创建/编辑与广告洞察；OAuth 回调见 `ads.*.callback.tsx`（含 `google-ads`、`google-merchant`、`google-analytics`、`google-search-console`、`meta-ads`、`meta-catalog`、`tiktok-catalog`）。
- `/api/ga4/*`、`/api/gsc/*`：Google Analytics 4 与 Search Console 的 auth-url、属性/站点列表、连接状态与断开。
- `POST /api/pagespeed`：PageSpeed Insights 实验室分析（平台 API Key，不落库，同步等待）。
- `/api/ai-capabilities`、`/api/upload-file`：AI 能力清单（由 Skill Manifest 派生）与工作台文件上传解析。
- `/api/conversations*`、`/api/files*`、`/api/context-resources*`：工作台会话与上下文资源。
- `/api/automation-overview`：Today/自动化概览。
- `/api/task-proposal`：聊天中的任务建议/确认载荷。
- `/api/support`、`/api/external-support`：客服会话与外部支持入口。
- `/api/feature-track`：前端功能使用埋点，写入 Aliyun SLS。
- `/api/pixel-ingest`：Web Pixel 采集入口。
- `webhooks.*.tsx`：Shopify 卸载、scope、订阅、购包、订单（paid/cancelled）、退款、库存、履约，以及 Google Merchant 商品状态与 Meta Catalog Webhook；公共执行/调试工具在 `app/server/webhook/`。
- `meta.data-deletion.tsx`、`favicon[.]ico.ts`：Meta 数据删除合规回调与 favicon 204 兜底，不属于业务入口。

React Router 使用 `app/routes.ts` 中的 `flatRoutes()`；新增或改名路由时必须按文件路由规则核对最终 URL，并检查父布局/索引路由关系。

## 4. 服务端领域导航

| 需求 | 首要代码入口 |
|---|---|
| 聊天请求与 SSE | `app/server/chat-stream.ts`、`app/server/chatPayload.server.ts` |
| Agent 图、模型、提示词 | `app/server/ai/core/shopChatGraph.server.ts`、`agentStream.server.ts`、`shopAssistantPrompt.ts` |
| Skill / Tool 注册 | `app/server/ai/skills/index.ts`、`app/server/ai/core/toolRegistry.server.ts` |
| Playbook 与能力目录 | `app/server/ai/playbooks/`、`app/server/ai/core/playbookRegistry.server.ts`、`skillManifest.server.ts` |
| AI 任务执行与日志 | `app/server/aiTask/`（`aiTaskStore` 状态、`aiTaskLogger` 日志、`aiTaskEventBus` SSE、`concurrencyLimiter` 并发、`batchTaskCreate` 批量）、各 Skill service |
| 商品文案与质量优化 | `app/server/productImprove/` |
| 商品目录和对象查询 | `app/server/productSearch/`、`app/server/shopify/productSearch.server.ts`、`app/server/shopify/shopifyObjectList.server.ts` |
| 图片生成 | `app/server/imageGeneration/` |
| 图片翻译 | `app/server/pictureTranslate/`、`app/server/imageMapping/`（原图 → Blob 映射，供 Image Switcher 替换） |
| 视觉模型凭证（火山引擎） | `app/server/volcengine/volcCredentials.server.ts`，被图片生成与图片翻译调用 |
| 视觉工具页聚合 | `app/server/visualTools/` |
| 广告 Catalog / 创建 / 编辑 / 洞察 | `app/server/adsCatalog/`、`app/server/adsCreate/`、`app/server/adsEdit/`、`app/server/adsInsights/`。下拉选项类只读列表（Meta Page、TikTok Pixel / Catalog、广告主）走 `adsCatalog/enumerationCache.server.ts` 的进程内 TTL 缓存，路由支持 `?refresh=1` 强刷；绑定校验、同步预检、上传确认等需要实时状态的路径禁止接缓存。Google Ads 凭证按 `accessTokenExpiresAt` 判断是否刷新、按 `loginCustomerIdVerifiedAt` 判断是否重新探测 login-customer-id，两个戳在对应值变化时必须失效。广告洞察 `structure` 视图默认读库（`adsInsights/store.server.ts`）：命中新鲜快照直接返回，过期才回源，回源固定拉 30 天再按请求区间切窗口，`?refresh=1` 强刷，回源失败用过期快照兜底；`keywords` / `searchTerms` / `creatives` 深层级明细和沙盒模式仍实时拉、不落库。洞察总览 `adsInsights/overview.server.ts` 纯库内聚合（不回源），凭证只 select `platform` / `externalAccountId` / `updatedAt`；商品审核计数统一走 `adsCatalog/productStatusSummary.server.ts` 的 `groupBy` 全量统计，不能用分页样本行数当总数。接入链路健康 `adsCatalog/adsHealth.server.ts` 由凭证 JSON 派生且只输出可见标识（不含 token），唯一需要实时探测的 GMC↔Ads 关联走 `/api/ads-overview/link-status`，由前端异步调用、失败降级为未知 |
| Google Analytics 4 | `app/server/googleAnalytics/`（`ga4Api.server.ts` 读数、`ga4Credentials.server.ts` OAuth 凭证） |
| Google Search Console | `app/server/googleSearchConsole/`（`gscApi.server.ts`、`gscCredentials.server.ts`） |
| PageSpeed Insights | `app/server/pageSpeed/`（PSI v5 `fetch`，平台级 `GOOGLE_PAGESPEED_API_KEY`，结果不落库） |
| 物流承运商凭证 | `app/server/logisticsCredentialStore.server.ts` |
| 统一任务列表 | `app/server/unifiedTask/` |
| 任务建议/聊天卡片 | `app/server/taskProposal/`、`app/server/ai/core/resolveChatCardIntent.server.ts` |
| Today/运营诊断/ROI | `app/server/operations/`、`app/server/automation/`。两个入口不要混用：只读指标/诊断项/任务走 `ensureDailySnapshotOverview`（命中当日快照时不重算），需要 `detail` 明细对象才用 `ensureDailySnapshot`（必然触发一轮 30 天全量诊断） |
| Shopify 数据读取与同步 | `app/server/shopify/`、`app/server/shopify/sync/` |
| 计费、订阅、购包 | `app/server/billing/`、`app/server/tokenUsage/` |
| 会话与文件上下文 | `app/server/conversation/`、`app/server/fileContext/` |
| 支持聊天 | `app/server/support/` |
| 邮件与商户通知 | `app/server/email/`、`app/server/notifications/` |
| 飞书运营通知 | `app/server/feishu/` |
| App 生命周期与事件 | `app/server/appLifecycle/`、`app/server/commonEventLog/`、`app/server/partner/`（Partner API 拉卸载反馈） |
| Webhook 公共执行与出站错误 | `app/server/webhook/`、`app/server/common/outboundError.server.ts` |
| 会话、运行时环境、嵌入式回跳 | `app/server/session/`、`app/config/runtimeEnv.server.ts`、`app/server/shopify/embeddedEntry.server.ts`、`app/server/shopify/sessionTokenBounce.server.ts` |
| Web Pixel / 阿里云日志 | `app/server/webPixel/`、`app/server/aliyunLog/` |
| Agent 运行摘要 | `app/server/agentRunLog/` |
| Playbook Case | `app/server/playbookCase/` |

AI 主链路应从真实代码确认，通常为：工作台 `useChatStream` → `POST /chat-stream` → `app/server/chat-stream.ts` → `invokeChatAgent` / LangGraph → 全局 Tool Registry → SSE 事件回传。修改工具时同时检查注册、schema、执行器、token 计费、任务卡片和测试，不要只改工具实现文件。

## 5. 数据与外部系统边界

- **Turso / libSQL + Prisma**：业务主数据。模型在 `prisma/schema.prisma`，包括 Session、Account/订阅/计费、AITask、订单/退款/客户/库存/履约镜像、WorkspaceFile、Conversation/Message、运营诊断、成本/ROI、支持会话、广告平台凭证（AdPlatformCredential）、广告实体与日指标（AdEntity / AdMetricDaily / AdInsightsSync）、商品审核状态（GmcProductStatus / MetaProductStatus）等。广告与审核状态相关的约定：
  - `AdPlatformCredential.externalAccountId` 是索引列，由 `credentialStore.server.ts` 按平台从凭证 JSON 派生（GMC merchantId、Meta/TikTok catalogId、广告账户 ID），webhook 靠它反查店铺；不要再用 `json_extract` 扫全表。
  - `AdMetricDaily` 只存广告级可加指标。更高层级和更长区间一律 SUM 上卷，CTR / CPC / ROAS 等派生指标查询时算，不落库。`reach` / `frequency` 是去重指标，跨天无法还原，因此不入库、上卷后返回 null；新增指标前先判断它是否可加。
  - 审核状态与广告实体都是「全量重建」写法：`$transaction` 里 `deleteMany` + 分批 `createMany`，不要退回逐条 upsert。因此拉取必须翻完分页，截断会把没拉到的商品当成已下架。
- **Azure Cosmos DB**：Agent 运行摘要和 Playbook Case 等事件/结果型数据；入口集中在 `app/server/cosmos/`、`agentRunLog/`、`playbookCase/`。默认不应假设容器会自动创建。
- **Azure Blob Storage**：上传文件、图片生成、图片翻译及兼容翻译内容。写入前确认容器、SAS 生命周期和清理策略。
- **Redis / Render KV**：主应用专用 KV 环境变量为 `SPARK_KV`（Render 测试实例名 `spark-kv-test`，本地 `.env` 与 Render 测试环境已配）；后续主应用缓存/锁等场景统一读 `SPARK_KV`，不要用 Admin 的 `RENDER_KV`。Admin 翻译运维仍优先 `RENDER_KV`（与 TSF 同名；兼容 `REDIS_URL`）。主应用业务代码目前尚未接入 Redis 客户端；接入时须可缺省降级，且不要未经确认把新的核心业务对象只存 Redis。
- **Aliyun SLS**：Pixel、访问与功能行为日志。
- **Shopify Admin GraphQL / Billing**：店铺数据、写回、订阅与一次性购包。
- **Google Merchant API v1**：Ads Catalog 的 Merchant 账户发现、primary API data source、`ProductInput` 写入、商品审核状态和账户问题读取；OAuth 继续使用 `content` scope，通知订阅使用 Notifications v1。运行时不得恢复 Content API v2.1。
- **Google Ads 再营销**：Ads Catalog 使用 `product_link` / `product_link_invitation` 完成 GMC↔Ads 幂等关联，并从 Ads customer 设置发现 AW 标签。Theme block 只发送非 purchase 店面事件；purchase 由商户手动安装的实验性 Custom Pixel 发送，Google 官方不支持该运行方式，UI 必须持续展示数据损失、重复上报与 Support 不保障告警。
- **Google Analytics 4 Data API / Search Console API**：Settings 下 GA4 与 GSC 的连接、属性/站点发现与报表读取，均为只读分析数据；OAuth 凭证经 `app/server/googleAnalytics/ga4Credentials.server.ts`、`app/server/googleSearchConsole/gscCredentials.server.ts` 存取。
- **火山引擎（Volcengine）视觉模型**：图片生成与图片翻译的模型调用，凭证在 `app/server/volcengine/`。
- **Shopify Partner API**：仅用于拉取卸载反馈（`app/server/partner/`），不是业务写入通道。
- **腾讯 SES / 飞书**：商户邮件与内部运营通知。通知失败通常不应阻断主业务，沿用现有场景封装。
- **物流承运商凭证**：运行时写入本地 JSON `.data/logistics-provider-credentials.json`（`app/server/logisticsCredentialStore.server.ts`），未做加密存储。
- **TSF 只读观测**：Admin `admin/server/routes/tsf*.ts`、`translationOps.ts`、`shopifyTranslation.ts` 等读取 TSF Turso、Cosmos、Redis、Blob 或 Shopify 翻译资源。它们是运维/报表边界，不代表 Spark 重新拥有整店翻译执行链路。

存储设计默认遵守：业务对象与遥测分离；先复用现有 store/service，再考虑新增容器或表；涉及跨仓库整店翻译边界时同时核对 TSF 当前实现。

## 6. 必读文档路由

只读取与当前任务相关的文档，但下列规则是强制的：

| 任务类型 | 修改前必须读取 |
|---|---|
| 任意任务（协作风格，§0 强制） | `.cursor/skills/deliberate-collab/SKILL.md` |
| 项目架构、跨域改动、环境变量、部署 | `docs/PROJECT_CONTEXT.md`，并以当前代码复核过时路径 |
| 新增 AI Skill / Tool / Playbook / Shopify scope | `docs/ROADMAP.md` |
| Tools 页面、任务生命周期、确认/审核/进度交互 | `docs/INTERACTION_DESIGN.md` |
| 任意前端视觉、布局、组件样式 | `docs/DESIGN.md` |
| 计费、订阅、购包、token 池、Webhook | `app/server/billing/agent.md` |
| Today 运营工作流 | `docs/DAILY_OPERATIONS_WORKFLOWS.md` |
| 信息架构和功能归属 | `docs/SPARK_FUNCTION_INVENTORY.md` |
| 整店翻译兼容、运营排查或跨 TSF 边界 | 直接读取 TSF 根 `AGENTS.md` 和 `packages/translation-core/*`；Spark 只保留图片翻译、兼容清理与 Admin 只读观测 |

文档名和路径区分大小写时以磁盘实际文件为准。不要引用不存在的旧文档（例如旧版说明中的 `docs/generateDescription.md` 或 `docs/agent-run-log.md`）。

用户粘贴飞书 Wiki/Docx 链接时，必须先读取正文再分析：

```powershell
node scripts/fetch-feishu-doc.mjs "<飞书链接>"
node scripts/fetch-feishu-doc.mjs "<飞书链接>" --out ./docs/tmp/<name>.md
```

凭证仅从根目录环境变量 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 读取；禁止把值写入日志、文档或提交。

## 7. 前端和任务 UI 约束

- 保持现有六目的地信息架构（Ask / Today / Studio / Insights / Tasks / Settings）；除非用户明确要求重构，不新增一级导航或恢复旧的 per-tool 导航。
- 优先复用 `DestinationPage`、`SegmentedPageTabs`、`DialogShell` 和 `pagePrimitives.module.css` 等共享页面原语。
- 所有任务列表 Card 必须以 `app/routes/component/aiTask/AITaskCardShell.tsx` 为基础。Shell 负责容器、header、状态、进度、动作区和日志挂载；业务 Card 负责文案、进度计算、actions 与业务状态。
- 标准参考：`app/routes/component/productImprove/ProductImproveTaskCard.tsx`、`app/routes/component/imageStudio/ImageGenerationTaskCard.tsx`、`app/routes/component/imageStudio/PictureTranslateTaskCard.tsx`；广告同步卡参考 `app/routes/component/adsCatalog/AdsCatalogTaskCard.tsx`。
- 用户可见文案必须同步维护 `app/locales/zh/common.json` 与 `app/locales/en/common.json`，不得在组件中新增只覆盖一种语言的硬编码文案。
- 使用现有 Shopify Web Components、Ant Design 和样式体系；不要引入第二套设计系统。
- 页面 loader/action、API 和 Webhook 必须沿用 `authenticate.admin(request)` 等现有鉴权边界；不要为了复用把 server secret 或 Admin API 客户端带入浏览器代码。
- `.server.ts` 模块保持服务端专用。组件中不要直接导入 Node-only、Prisma、Azure、Redis 或 secret 配置。

## 8. 数据库与迁移规则

- Prisma schema：`prisma/schema.prisma`；生成目录：`app/generated/prisma/`。
- 修改 schema 后至少运行 `npx prisma generate` 和适当的 schema 校验/测试。
- Turso 运行时由 `app/db.server.ts` 和 `TURSO_*` 变量连接；Prisma datasource 的 `DATABASE_URL` 主要用于 CLI、本地 SQLite 和生成流程。
- 测试/生产 Turso 迁移使用仓库脚本：`npm run turso:migrate:test`、`npm run turso:migrate:prod`。
- 不要把 `prisma migrate deploy` 直接指向 `libsql://`。
- 当前迁移目录中部分 `add_*` 迁移时间早于 `init`；新建本地库前先核对迁移顺序。必要时使用本地 SQLite + `prisma db push`，不要擅自重排或改写已上线迁移。
- 未经用户明确授权，不执行生产迁移、删表、drop schema、批量数据回填或真实 Shopify 写操作。

## 9. Admin 后台

Admin 是独立项目，不能假设根目录命令会检查它。

```powershell
cd admin
npm run dev       # Express 3099 + Vite 5174
npm run build     # Vite client + tsc server
```

- API 入口：`admin/server/index.ts`、`admin/server/routes/`。
- 前端入口：`admin/src/App.tsx`、`admin/src/pages/`、`admin/src/api.ts`。
- 外部存储连接：`admin/server/lib/`。
- 鉴权边界：`admin/server/middleware/auth.ts`；收入、Pixel logs、TSF billing/revenue/ROI、OpenRouter 探测等 owner-only 路由在 `admin/server/index.ts` 使用 `requireOwner`。
- 主要 API 路由族：Spark 运营（overview/shops/usage/capabilities/subscriptions/revenue/agent-runs/billing-rules/pricing-workbench/todos/ops-checklist/visit-source/support/app-logs/pixel-logs/shop-profile）、TSF 观测（`/api/tsf/*`：overview/shops/usage/subscriptions/packs/billing/shop-profiles/language-coverage/revenue/roi/credits）、翻译运维只读/修复（`/api/translations`、`/api/translation-ops`、`/api/shopify-translation`）、Redis Explorer、OpenRouter 探测。`admin/server/routes/` 下所有路由文件都在 `admin/server/index.ts` 挂载，没有孤儿路由。
- 前端页面路由见 `admin/src/App.tsx`；除下文详述的几个页面外还有 `/translations`、`/shop-translation`、`/translation-ops`、`/shopify-translation`、`/translate-v4-support`、`/tsf/billing`、`/tsf/packs`、`/tsf/shop-profiles/:shop`、`/redis-explorer`。改 Admin 导航前先读该文件，不要凭本节清单推断。
- Admin 没有配置测试框架；改动后必须在 `admin/` 中运行 `npm run build`。
- 修改共享 Prisma schema 后，主应用和 Admin 的 Prisma 类型/构建都要考虑。
- 翻译 tab「翻译 ROI」：`/tsf/roi`（owner）→ `admin/src/pages/tsf/TsfRoi.tsx` +
  `admin/server/routes/tsfRoi.ts`。安装/留存以 TSF `Account` 为准（`ShopBillingBinding`
  已废弃）；Turso 收入/auto 已接；漏斗行为与 LLM 成本走 SLS（未接时页面 Mock + howto）。
- TSF「每日收入」：`/tsf/revenue` → `admin/src/pages/tsf/TsfRevenue.tsx` +
  `admin/server/routes/tsfRevenue.ts`。按 `BillingLog`×`PlanCatalog` 聚合；必须排除
  `metadata.source = legacy_migration`（Spring→Turso 迁移审计，非真实扣款日）；
  同店 24h 内被后续 `SUBSCRIPTION_ACTIVATED` 覆盖的激活不计入（改套餐只计终态）。
- 翻译 tab「语言覆盖率」：`/tsf/language-coverage` →
  `admin/src/pages/tsf/TsfLanguageCoverage.tsx` +
  `admin/server/routes/tsfLanguageCoverage.ts`。商店列表以 Turso
  `Account`（在装）为准；目标语言/自动翻译来自 `ShopTargetLocale`；覆盖率按
  `tsf:items_count:{shop}:{locale}` 批量查 Redis。快照约 60s，`refresh=1`
  强制重载。
- 翻译 tab「用户额度查询」：`/tsf/credits` →
  `admin/src/pages/tsf/TsfCredits.tsx` + `admin/server/routes/tsfCredits.ts`。
  按 shop 查 TSF Turso：`Account` 额度拆分、`TOKEN_PACK_PURCHASED` 加购记录、
  `BillingLog` 流水与 `AccountPeriodUsage` 周期归档；支持添加/修改
  `purchasedCredits`（`POST /api/tsf/credits/purchased`，审计事件
  `ADMIN_PURCHASED_CREDITS_ADJUSTED`，不计入加购收入）；所有登录用户可查可改。
- 翻译 tab「单字段翻译日志」：`/tsf/single-translate-logs` →
  `admin/src/pages/tsf/TsfSingleTranslateLogs.tsx` +
  `admin/server/routes/tsfSingleTranslateLogs.ts`（只读 TSF Turso
  `CreditUsage`，`source=single`；展示扣费积分与 metadata，不含原文/译文）。
- Spark tab「OpenRouter 探测」（owner）：`/openrouter-probe` →
  `admin/src/pages/OpenRouterProbe.tsx` +
  `admin/server/routes/openrouterProbe.ts`。服务端用 `OPENROUTER_API_KEY`
  转发 `/models` / `/chat/completions`，用于验证不同模型与地区出口；
  key 不下发浏览器。本地写在 `Spark/.env` 或 `admin/.env`，生产写 Render secrets。

## 10. 常用命令

根目录：

```powershell
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:watch
npm run prisma:studio
npm run turso:migrate:test
```

补充：

- Node 版本要求以 `package.json` 为准：`>=20.19 <22 || >=22.12`。
- `npm run dev` 包装 `shopify app dev`，需要 Shopify CLI 登录和应用配置；多应用配置用 `npm run dev:yw`、`npm run dev:spark-zz`（对应 `shopify.app.*.toml`）。
- 运维/交付脚本：`npm run deploy:test`（Render 测试环境）、`npm run push:pr`（提交 + push + 建 PR）、`npm run render:digest`（Render 日志摘要）、`npm run orders:create`（生成测试订单）、`npm run turso:migrate:prod`、`npm run turso:drop-schema:test|prod`（破坏性，需明确授权）。完整清单以 `package.json` scripts 为准。
- 主应用服务端运行需要 Shopify 和 Turso 相关变量；AI、Cosmos、Blob、Redis、SES、飞书等能力按功能依赖相应变量。
- 单元测试位于 `tests/`；`scripts/*.test.cjs` 不属于 Vitest，需按脚本单独用 `node --test` 执行（仓库已有 `npm run test:render-digest` 等包装）。
- 不读取或输出 `.env` / `.env.prod` 的值。只记录所需变量名。

## 11. 验证矩阵

根据改动范围先跑聚焦检查，再跑交付门禁：

| 改动 | 最低验证 |
|---|---|
| 纯文档 | 检查链接、路径、命令与 `git diff --check` |
| 纯工具函数/服务 | 对应 Vitest 文件 + `npm run typecheck` |
| 路由/API/服务端业务 | 相关测试 + `npm run typecheck` + `npm run build` |
| 前端组件/页面/i18n | `npm run typecheck` + `npm run build`，必要时浏览器验证 |
| Prisma schema/计费/任务状态 | 相关测试 + `npx prisma generate` + `npm run typecheck` + `npm run build` |
| Admin 任意代码 | `cd admin && npm run build` |
| Web Pixel 扩展 | 根构建 + Shopify 扩展相关验证/部署前检查 |

代码改动的默认完整门禁：

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

若仓库存在与本次无关的既有失败，必须记录准确命令、错误摘要，并证明本次相关的聚焦验证已通过；不能笼统写“有旧错误”。文档改动无需为形式而运行整套构建。

## 12. 工作纪律

- 只改需求相关文件；不顺手格式化、重命名或清理无关代码。
- 工作树可能不干净。用户改动优先，禁止使用 `git reset --hard`、`git checkout --` 或删除未跟踪文件来“清理”环境。
- 搜索优先使用 `rg` / `rg --files`；先追真实调用方，再删除 wrapper、兼容层或旧 API。
- 不猜接口。Shopify GraphQL、scope、版本或平台约束可能变化时，使用仓库配置的 Shopify 开发工具或官方文档核实。
- 对外部写操作保持最小权限：部署、生产迁移、发送真实邮件/飞书消息、修改 Shopify 数据、推送分支或创建 PR，只有在用户明确要求时执行。
- 新增环境变量时同步更新相应配置校验和文档，只记录名称、用途、是否必需，不提交 secret。
- 设计跨存储或跨仓库方案时，先画清所有权和调用路径；Telemetry、Agent 运行摘要和业务对象默认分开存储。
- 完成后报告：修改了什么、关键文件、验证结果、剩余风险或被阻塞项。

## 13. 维护本文件

当以下事实发生变化时，相关代码改动必须同步更新本文件：

- 一级导航、主要路由或服务边界变化；
- 新增/删除可部署应用、worker、扩展或外部存储；
- package scripts、Node 版本或验证门禁变化；
- 新增强制设计/交互/计费/迁移约束；
- 领域文档重命名或迁移。

更新时以代码扫描结果为准，删除过时描述，不把一次性排错记录、机器路径、密钥值或长篇实现细节堆进本文件。
