# AGENTS.md

本文件是编码 agent 在 `Spark` 仓库中的入口和长期维护的代码导航。它适用于仓库根目录及所有子目录；若某个子目录以后新增更具体的 `AGENTS.md`，则子目录文件在其作用域内优先。

## 0. 怎么用本文件

本文件是仓库地图与硬门禁，不是逐步执行的流程清单。默认：查代码 → 直接做 → 按风险自选验证。有产品/技术分叉或不可逆操作时再停下来对齐；复杂协作可按需参考 `.cursor/skills/deliberate-collab/SKILL.md`。

若本文件已随上下文注入，不必为「怕旧副本」再完整重读；只有不确定或仅凭历史记忆时再打开。不推测没打开过的代码。

若本文件、旧文档和当前代码冲突，优先级为：**当前代码与配置 > `package.json` / Prisma schema > 本文件 > 领域文档 > README**。发现漂移时，应在本次改动范围内同步更新本文件或对应文档。

## 1. 项目现状

Spark 是嵌入 Shopify Admin 的 AI 运营应用，当前仓库有两个可独立运行的应用和 Shopify 扩展：

- **主应用（仓库根目录）**：React 18、React Router 7 文件路由、Vite、Shopify App Bridge / Web Components、Node 服务端，默认由 Shopify CLI 启动。
- **Admin 后台（`admin/`）**：Express API（本地默认 `3099`）+ Vite React 前端（本地默认 `5174`）。它有独立的 `package.json`、依赖和构建流程。
- **Web Pixel 扩展（`extensions/ciwi-spark-web-pixel/`）**：采集 Shopify analytics/custom events，经主应用 `/api/pixel-ingest` 上报。**审核期** `shopify.extension.toml.off`，不部署。
- **Theme App Extension（`extensions/spark-tiktok-pixel/`）**：受 Shopify 单应用 Theme Extension 数量上限约束（每应用仅 1 个），同一扩展包内包含相互隔离的 App Embed：TikTok Pixel、Google Remarketing、Ciwi Image Switcher。**审核期** 整包 `shopify.extension.toml.off`，`blocks/*.liquid` 均在 `_disabled_pixel_blocks/`，不部署。过审后还原 toml 与 liquid。TikTok 配置经 `spark_tiktok.pixel_config` 下发；Google 再营销/转化配置经 app-owned Shop metafield `google_remarketing_config` 下发（含 `tagId`=AW-数字、可选 `conversionLabel`、`enhancedConversions`，配置了 label 时店面事件按 `send_to=AW-ID/label` 上报为 Google Ads 转化），并受 Customer Privacy API 营销同意门禁控制；Image Switcher 经 App Proxy 做图片替换与 IP 地区跳转。不要再新增第二个 `type = "theme"` 扩展目录。Google Pixel 三步向导入口在 `/app/ads/google-pixel`（Nabu 风格：添加像素 / 开启 App Embed / 创建像素）；**审核期** 向导不再生成/展示 purchase Custom Pixel 粘贴。App Embed 启用状态经 `read_themes` 读取主题 `config/settings_data.json` 检测。

重要边界：

- 当前仓库**没有 `worker/` 目录或 Translation Worker 可部署服务**。
- 整店/多语言翻译任务及共享翻译核心归 TypeScriptFrontend（TSF）所有；`app/server/ai/skills/index.ts` 不再注册整店翻译工具，Spark 也不再保存翻译规则或 Worker 实现副本。
- Spark 内仍有**图片翻译**功能，以及 `app/server/translation/translateBlobStore.server.ts` 等少量兼容清理、Admin 只读观测代码。`/app/studio/translate` 当前只重定向到 `/app/studio/copy`，不要把图片翻译、兼容 Blob 读取或 Admin 运维页误判为整店翻译运行时。
- Shopify 订单、退款、客户、库存、履约同步在主应用 `app/server/shopify/sync/` 与 Webhook 中实现；历史订单回补入口是 `/app/settings/data`，不是独立 worker。安装后自动回补（`ensureInstallOrderBackfill`，默认近 `SPARK_ORDER_BACKFILL_DAYS` 天）与 toml 里的 webhook **订阅**是两回事：路由在仓库里，未 `shopify app deploy` 订阅则增量进不了库。
- 工作树中可能出现 `scripts/tmp/` 下临时排查脚本（该目录已 gitignore）；除非用户明确要求，禁止删除、覆盖或纳入改动。

发布姿态与 Partner 应用（邀请制内测，不是 App Store 公开）：

- 仓库常用 toml：`shopify.app.test.toml`（AiAssistant-Test → Render Test）、`shopify.app.prod.toml`（→ Render `Spark-Prod` / `spark-prod.onrender.com`）、`shopify.app.yw.toml`、`shopify.app.spark-zz.toml`（本地）；另可能有其它 `shopify.app.*.toml`。CI（`spark-deploy.yml`）可手动勾选发布 Spark Test / Spark Prod / Admin / Admin Test。**从零发布新 Shopify App 的步骤见 `docs/SHOPIFY_APP_PUBLISH.md`。**
- **改了 toml 的 `scopes` 必须对该配置 `shopify app deploy`，且已安装的店铺会走一次重新授权**（Shopify 在下次进应用时弹权限页，商户不点同意就用不了新能力）。prod 现有 scope 里 `read_inventory` / `write_inventory` 是为真实 COGS、成本价导入与库存导入加的；不要为「以后可能用得上」提前申请用不到的 scope，审核时要逐条解释。
- **给商户用的那个 toml 必须自己订阅订单类 webhook，改完后对该配置 `shopify app deploy`。** `shopify.app.test.toml` 与 yw / spark-zz 一样订阅 `orders/paid|cancelled`、`refunds/create`、`inventory_levels/update`、`fulfillments/create|update`（另有订阅/购包/卸载/scope）。只改 toml 不会生效。
- Shopify **分发方式选定后不可改**。邀请多家互不相关的真实店且要走现有 Shopify Billing：选 **Public + Unlisted**（不出现在搜索，发链接安装；仍要 App Store 审核）。**Custom** 只能装单店或同一 Plus 组织（或 transfer-disabled 开发店），**不能**用 Shopify 应用计费，也不能再改成 Public。不要为每个商家复制一个 Custom 应用。细节与当前周期任务见 `docs/ROADMAP.md` 第七、八节。
- 卸载目前：通知 + **归档快照到 Blob** 后从 Turso **删除该店业务数据**（含 Session、订单镜像、对话、广告凭证、客服、`Account`、`CommonEventLog` 等）；`PromoClaimLedger`（shopHash）保留以防安装福利被薅。GDPR `shop/redact` 再跑一遍幂等清理；`customers/redact` 擦除客户镜像 PII。改 toml 后须对该配置 `shopify app deploy`。公开上架仍缺隐私政策页（需披露安装福利防滥用 hash 账本）。
- 新装默认经 `ensureInstallPromoTokens` 自动发放安装福利 Token（账户页营销活动，默认 1,000,000；每店每活动一次，账本按 shopHash），无需手动领取。
- 邀请制内测**不展示**风控链路、回收期/长期 ROI，以及 Health Monitor「ROI 情况（短期和长期）」；短期 ROI 仍在经营页，等产品公式再改计算。详情见 `docs/ROADMAP.md` 第七节。

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
├─ extensions/                Shopify 扩展：Web Pixel + Theme（审核期均为 toml.off；过审后恢复 TikTok / Google Remarketing / Image Switcher）
├─ prisma/                    schema、迁移和计费种子 SQL
├─ tests/                     与 app/ 大体镜像的 Vitest 测试
├─ scripts/                   运维脚本（Turso 迁移、部署、飞书文档、广告沙盒探针等）；共用 `scripts/lib/loadEnv.mjs`
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
| 首页 | `/app` | `app._index.tsx` + `HomeV2Panel`（本页直接聊天）；旧 `/app/home-v2` 重定向至此 |
| 助手 | `/app/assistant` | `app.assistant.tsx` → `WorkspaceAppShellPage`（默认进对话；prod 导航可不展示） |
| 首页 v1 | `/app/home-v1` | `app.home-v1.tsx` + `HomePanel`（原首页经营概览；提问跳转助手；prod 导航可不展示） |
| Today | `/app/today` | `app.today.*`：`_index` 经营驾驶舱；详情页含 `revenue` / `profit` / `cost` / `roi` / `traffic` / `conversion` 等。`orders` / `diagnosis` / `insights` 为兼容重定向（分别到 revenue / health-monitor 或 Today 详情） |
| Health Monitor | `/app/health-monitor` | `app.health-monitor.tsx`，站点健康/可信度监测（总览走 `ensureDailySnapshotOverview`，`?view=detail` 才走 `ensureDailySnapshot`） |
| Studio | `/app/studio` | `app.studio.*`，`copy` 商品文案，`image` 图片生成/图片翻译；`translate` 旧入口重定向到 `copy` |
| Tasks | `/app/tasks` | `app.tasks.tsx` + `UnifiedTaskListPage` |
| 账户与订阅 | `/app/account` | `app.account.tsx` → `BillingPage`（套餐与 Token 额度）；旧 `/app/settings/billing` 重定向至此 |
| Settings | `/app/settings` | `app.settings.*`：广告投放、物流、GA4、GSC、PageSpeed、数据回补、ShopifyQL 报表、反馈等；计费已迁出到「账户与订阅」。`/app/ads-catalog` 为 Ads Catalog 可路由入口（Settings/Studio 内链，不占一级导航） |

兼容层（不占一级导航）：`/app/insights*` 与旧投放洞察路径多为重定向到 Today 或 Ads Catalog；不要把 Insights 当作当前一级目的地。旧 `/app/home-v2` 重定向到 `/app`。

Ask / 首页工作台上下文工具（聊天输入区）当前仅：**商品 / 订单 / 文章 / 文件**（`ContextTool = product \| article \| order \| file`）。已移除输入区 Playbook 快捷条；遗留 `prefillConstraint` query 只做 URL 清理、不再写入上下文。任务确认卡仍由 agent/SSE 的 `task_proposal` 产出。

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
- `/api/conversations*`、`/api/files*`、`/api/context-resources*`：工作台会话与上下文资源（`context-resources` 类型为 product / article / order）。
- `/api/automation-overview`：Today/自动化概览。
- `/api/task-proposal`：TaskProposal 确认卡的估算/执行入口（由聊天流里的 `task_proposal` 卡片触发，不是独立工具栏按钮）。
- `POST /api/bulk-price-edit`：批量调价写回入口，是全仓库**唯一**会改 Shopify 商品价格的地方；必须带 `confirm: true` 且任务处于 `pending_review`。Agent 回合内（chat-stream / Skill / dry-run）禁止走到这里。
- `POST /api/bulk-tag-edit`：批量打标写回入口，是全仓库**唯一**会改 Shopify 商品标签的地方；门禁与调价一致（`confirm: true` + `pending_review`）。
- `POST /api/bulk-status-edit`：批量上下架写回入口，是全仓库**唯一**会改商品 `status` 的地方；门禁同上。只写 `ACTIVE` / `DRAFT`，不碰销售渠道发布。
- `POST /api/bulk-collection-edit`：批量入 / 出 Collection 写回入口，是全仓库**唯一**会改合集手动成员的地方；门禁同上。只对手动合集成立，智能合集在试算期就被拒。
- `POST /api/bulk-seo-edit`：批量 SEO 改写写回入口，是全仓库**唯一**会改商品 `seo.title` / `seo.description` 的地方；门禁同上。
- `POST /api/bulk-metafield-edit`：批量改商品自定义字段写回入口，是全仓库**唯一**会调 `metafieldsSet` / `metafieldsDelete` 改商品 metafield 的地方；门禁同上。只动试算里选定的那一个 `namespace.key`，不碰其它字段。
- `POST /api/bulk-price-import`：价目表导入写回入口，门禁与调价一致（`confirm: true` + `pending_review`）。它**不新增** mutation，内部复用 `applyBulkPriceEdit`，所以 `productVariantsBulkUpdate` 仍只有一个调用处。
- `POST /api/bulk-cost-import`：成本价导入写回入口，是全仓库**唯一**会改 `inventoryItem.unitCost` 的地方；门禁同上，需要 `write_inventory`。写回成功后直接 `upsertSkuCosts` 刷新本地 `ShopSkuCost`，利润/ROI 不必等 24 小时懒同步。
- `POST /api/bulk-inventory-import`：库存导入写回入口，是全仓库**唯一**会改 Shopify 库存数量的地方；门禁同上，另要求试算结果里有 `locationId`，需要 `write_inventory`。只写单个地点的 `available`，不写 `on_hand`、不激活地点。
- `/api/support`：客服会话入口。
- `/api/feature-track`：前端功能使用埋点，写入 Aliyun SLS。
- `/api/pixel-ingest`：Web Pixel 采集入口。
- `POST /api/internal/credit-migration`：翻译 App 迁入积分（HMAC，`CREDIT_MIGRATION_SECRET`；无 Shopify session）。
- `webhooks.*.tsx`：Shopify 卸载、scope、订阅、购包、订单（paid/cancelled）、退款、库存、履约、GDPR 合规（`/webhooks/compliance`：`customers/data_request` / `customers/redact` / `shop/redact`），以及 Google Merchant 商品状态与 Meta Catalog Webhook；公共执行/调试工具在 `app/server/webhook/`。
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
| 批量编辑与表格导入（10 项能力 + 公共层） | 细则见 `app/server/bulkEdit.agent.md`，由 `.cursor/rules/bulk-edit-agent.mdc` 按路径触发加载。覆盖批量调价 / 打标 / 上下架 / 调整合集 / 改 SEO / 改自定义字段、站内 SEO 体检，以及价目表 / 成本价 / 库存三个表格导入。全族统一四层：纯算 `app/lib/` → 只读 reader → 试算 dry-run（零 mutation，落 `pending_review`）→ 写回 apply（该 mutation 的唯一调用处）；Skill 只暴露只读列表与开卡，不注册 mutation 工具。改这一族任何文件前先读那份文件，里面每条「不能退化的约束」都附了理由 |
| 商品目录和对象查询 | `app/server/productSearch/`、`app/server/shopify/productSearch.server.ts`、`app/server/shopify/shopifyObjectList.server.ts` |
| 图片生成 | `app/server/imageGeneration/` |
| 图片翻译 | `app/server/pictureTranslate/`、`app/server/imageMapping/`（原图 → Blob 映射，供 Image Switcher 替换） |
| 视觉模型凭证（火山引擎） | `app/server/volcengine/volcCredentials.server.ts`，被图片生成与图片翻译调用 |
| 视觉工具页聚合 | `app/server/visualTools/` |
| 广告 Catalog / 创建 / 编辑 / 洞察 | `app/server/adsCatalog/`、`app/server/adsCreate/`、`app/server/adsEdit/`、`app/server/adsInsights/`。下拉选项类只读列表（Meta Page、TikTok Pixel / Catalog、广告主）走 `adsCatalog/enumerationCache.server.ts` 的进程内 TTL 缓存，路由支持 `?refresh=1` 强刷；绑定校验、同步预检、上传确认等需要实时状态的路径禁止接缓存。Google Ads 凭证按 `accessTokenExpiresAt` 判断是否刷新、按 `loginCustomerIdVerifiedAt` 判断是否重新探测 login-customer-id，两个戳在对应值变化时必须失效。广告洞察 `structure` 视图默认读库（`adsInsights/store.server.ts`）：命中新鲜快照直接返回，过期才回源，回源固定拉 30 天再按请求区间切窗口，`?refresh=1` 强刷，回源失败用过期快照兜底；`keywords` / `searchTerms` / `creatives` 深层级明细和沙盒模式仍实时拉、不落库。洞察总览 `adsInsights/overview.server.ts` 纯库内聚合（不回源），凭证只 select `platform` / `externalAccountId` / `updatedAt`；商品审核计数统一走 `adsCatalog/productStatusSummary.server.ts` 的 `groupBy` 全量统计，不能用分页样本行数当总数。接入链路健康 `adsCatalog/adsHealth.server.ts` 由凭证 JSON 派生且只输出可见标识（不含 token），唯一需要实时探测的 GMC↔Ads 关联走 `/api/ads-overview/link-status`，由前端异步调用、失败降级为未知 |
| Google Analytics 4 | `app/server/googleAnalytics/`（`ga4Api.server.ts` 读数、`ga4Credentials.server.ts` OAuth 凭证） |
| Google Search Console | `app/server/googleSearchConsole/`（`gscApi.server.ts`、`gscCredentials.server.ts`） |
| PageSpeed Insights | `app/server/pageSpeed/`（PSI v5 `fetch`，平台级 `GOOGLE_PAGESPEED_API_KEY`，结果不落库） |
| ShopifyQL 官方报表 | `app/server/shopifyql/`（`shopifyqlQuery` + 七域 preset：销售/退款/成本利润/客户/库存/履约/店面漏斗，入口 `/app/settings/shopify-reports`，需要 `read_reports` 与 Protected Customer Data Level 2） |
| 物流承运商凭证 | `app/server/logisticsCredentialStore.server.ts` |
| 统一任务列表 | `app/server/unifiedTask/` |
| 任务建议/聊天卡片 | `app/server/taskProposal/`、`app/server/ai/core/resolveChatCardIntent.server.ts`（Skill/SSE 产出 `task_proposal` → 前端 `TaskProposalCard` → `/api/task-proposal`） |
| Today/运营诊断/ROI | `app/server/operations/`、`app/server/automation/`。两个入口不要混用：只读指标/诊断项/任务走 `ensureDailySnapshotOverview`（命中当日快照时不重算），需要 `detail` 明细对象才用 `ensureDailySnapshot`（必然触发一轮 30 天全量诊断）。「近 7 天」经营页与健康度共用 UTC 完整日、不含今天（`app/lib/observationWindow.ts`）；展示按店铺 `ianaTimezone` 格式化 |
| Health Monitor | `app/routes/app.health-monitor.tsx` + `app/lib/healthMonitor*`；总览走 `ensureDailySnapshotOverview`，详情（`?view=detail`）才走 `ensureDailySnapshot`（不要把总览接到完整快照入口） |
| 工作台上下文（前端） | `app/routes/page/workspace/useWorkspaceContext.ts`、`ContextToolModal.tsx`、`ChatPanel.tsx`；Shopify 对象搜索 `app/server/shopify/contextResourceSearch.server.ts` + `/api/context-resources*` |
| Shopify 数据读取与同步 | `app/server/shopify/`、`app/server/shopify/sync/` |
| 计费、订阅、购包 | `app/server/billing/`、`app/server/tokenUsage/` |
| 会话与文件上下文 | `app/server/conversation/`、`app/server/fileContext/` |
| 支持聊天 | `app/server/support/` |
| 邮件与商户通知 | `app/server/email/`、`app/server/notifications/` |
| 飞书运营通知 | `app/server/feishu/` |
| App 生命周期与事件 | `app/server/appLifecycle/`、`app/server/commonEventLog/`、`app/server/partner/`（Partner API 拉卸载反馈） |
| Webhook 公共执行与出站错误 | `app/server/webhook/`、`app/server/common/outboundError.server.ts` |
| GDPR 合规 webhook | `app/routes/webhooks.compliance.tsx`、`app/server/webhook/complianceWebhooks.server.ts`；`shop/redact` / 卸载走 `archiveAndPurgeShopData`；`customers/redact` 擦客户镜像 |
| 会话、运行时环境、嵌入式回跳 | `app/server/session/`、`app/config/runtimeEnv.server.ts`、`app/server/shopify/embeddedEntry.server.ts`、`app/server/shopify/sessionTokenBounce.server.ts` |
| Web Pixel / 阿里云日志 | `app/server/webPixel/`、`app/server/aliyunLog/` |
| Agent 运行摘要 | `app/server/agentRunLog/` |
| Playbook Case | `app/server/playbookCase/` |

AI 主链路应从真实代码确认，通常为：Ask 工作台（`/app/assistant`）`useChatStream` → `POST /chat-stream` → `app/server/chat-stream.ts` → `invokeChatAgentStream`（`app/server/ai/core/agentStream.server.ts`）/ LangGraph → 全局 Tool Registry → SSE 事件回传（可含 `task_proposal`）。

## 5. 数据与外部系统边界

- **Turso / libSQL + Prisma**：业务主数据。模型在 `prisma/schema.prisma`，包括 Session、Account/订阅/计费、AITask、订单/退款/客户/库存/履约镜像、WorkspaceFile、Conversation/Message、运营诊断、成本/ROI、支持会话、广告平台凭证（AdPlatformCredential）、广告实体与日指标（AdEntity / AdMetricDaily / AdInsightsSync）、商品审核状态（GmcProductStatus / MetaProductStatus）等。广告与审核状态相关的约定：
  - `AdPlatformCredential.externalAccountId` 是索引列，由 `credentialStore.server.ts` 按平台从凭证 JSON 派生（GMC merchantId、Meta/TikTok catalogId、广告账户 ID），webhook 靠它反查店铺；不要再用 `json_extract` 扫全表。
  - `AdMetricDaily` 只存广告级可加指标。更高层级和更长区间一律 SUM 上卷，CTR / CPC / ROAS 等派生指标查询时算，不落库。`reach` / `frequency` 是去重指标，跨天无法还原，因此不入库、上卷后返回 null；新增指标前先判断它是否可加。
  - 审核状态与广告实体都是「全量重建」写法：`$transaction` 里 `deleteMany` + 分批 `createMany`，不要退回逐条 upsert。因此拉取必须翻完分页，截断会把没拉到的商品当成已下架。
- **Azure Cosmos DB**：Agent 运行摘要和 Playbook Case 等事件/结果型数据；入口集中在 `app/server/cosmos/`、`agentRunLog/`、`playbookCase/`。默认不应假设容器会自动创建。
- **Azure Blob Storage**：上传文件、图片生成、图片翻译及兼容翻译内容。写入前确认容器、SAS 生命周期和清理策略。
- **Redis / Render KV**：**与 ciwi-translate（TSF）共用同一 Render Key Value 实例**（`SPARK_KV` / Admin 的 `RENDER_KV` 可指向同一 URL；本地 External、Render 同区用 Internal）。主应用读写统一走环境变量 `SPARK_KV`；Admin 翻译运维只读仍优先 `RENDER_KV`（与 TSF 同名；兼容 `REDIS_URL`），用于观测 TSF 已有 key，**不要**用 Admin 客户端写入 Spark 业务 key。
  - **Key 命名空间（强制）**：主应用写入的每个 key **必须以 `spark:` 开头**（推荐 `spark:{domain}:{…}`，例如 `spark:lock:daily-snapshot:{shop}`）。**禁止**使用或覆盖 TSF 已有前缀：`translate:v4:`、`tsf:`、`tm:v5:`，以及其它非 `spark:` 前缀。接入客户端时集中做一个 key helper，禁止业务代码手拼裸 key。
  - 主应用业务代码目前尚未接入 Redis 客户端；接入时须可缺省降级，且不要未经确认把新的核心业务对象只存 Redis。
- **Aliyun SLS**：Pixel、访问与功能行为日志。
- **Shopify Admin GraphQL / Billing**：店铺数据、写回、订阅与一次性购包。历史指标报表走 `shopifyqlQuery`（需 `read_reports`），入口 `/app/settings/shopify-reports`。
- **Google Merchant API v1**：Ads Catalog 的 Merchant 账户发现、primary API data source、`ProductInput` 写入、商品审核状态和账户问题读取；OAuth 继续使用 `content` scope，通知订阅使用 Notifications v1。运行时不得恢复 Content API v2.1。
- **Google Ads 再营销**：Ads Catalog 使用 `product_link` / `product_link_invitation` 完成 GMC↔Ads 幂等关联，并从 Ads customer 设置发现 AW 标签。Theme block 只发送非 purchase 店面事件；purchase 由商户手动安装的实验性 Custom Pixel 发送，Google 官方不支持该运行方式，UI 必须持续展示数据损失、重复上报与 Support 不保障告警。
- **Google Analytics 4 Data API / Search Console API**：Settings 下 GA4 与 GSC 的连接、属性/站点发现与报表读取，均为只读分析数据；OAuth 凭证经 `app/server/googleAnalytics/ga4Credentials.server.ts`、`app/server/googleSearchConsole/gscCredentials.server.ts` 存取。
- **火山引擎（Volcengine）视觉模型**：图片生成与图片翻译的模型调用，凭证在 `app/server/volcengine/`。
- **Shopify Partner API**：仅用于拉取卸载反馈（`app/server/partner/`），不是业务写入通道。
- **腾讯 SES / 飞书**：商户邮件与内部运营通知。通知失败通常不应阻断主业务，沿用现有场景封装。
- **物流承运商凭证**：运行时写入本地 JSON `.data/logistics-provider-credentials.json`（`app/server/logisticsCredentialStore.server.ts`），未做加密存储。
- **TSF 只读观测**：Admin `admin/server/routes/tsf*.ts`、`translationOps.ts`、`shopifyTranslation.ts` 等读取 TSF Turso、Cosmos、Redis、Blob 或 Shopify 翻译资源。它们是运维/报表边界，不代表 Spark 重新拥有整店翻译执行链路。

存储设计默认遵守：业务对象与遥测分离；先复用现有 store/service，再考虑新增容器或表；涉及跨仓库整店翻译边界时同时核对 TSF 当前实现。

## 6. 文档索引（按需）

需要时再打开，不要求改前先通读。路径规则（如计费 / 批量编辑）仍可能按文件路径单独触发领域文档。

| 主题 | 文档 |
|---|---|
| 项目架构、跨域、环境变量、部署 | `docs/PROJECT_CONTEXT.md`（以当前代码复核过时路径） |
| **发布新 Shopify App（CLI + Render + 密钥/URL）** | `docs/SHOPIFY_APP_PUBLISH.md` |
| 新增 AI Skill / Tool / Playbook / Shopify scope | `docs/ROADMAP.md` |
| 邀请制内测、Partner 分发、上架门禁 | `docs/ROADMAP.md` 第六–八节 |
| Tools 页面、任务生命周期、确认/审核/进度交互 | `docs/INTERACTION_DESIGN.md` |
| 前端视觉、布局、组件样式 | `docs/DESIGN.md` |
| 计费、订阅、购包、token 池、Webhook | `app/server/billing/agent.md` |
| 批量编辑、SEO 体检、表格导入 | `app/server/bulkEdit.agent.md` |
| Today 运营工作流 | `docs/DAILY_OPERATIONS_WORKFLOWS.md` |
| Today 信息架构 | `docs/TODAY_INFORMATION_ARCHITECTURE.md` |
| Health Monitor AI 明细 | `docs/HEALTH_MONITOR_AI_DETAIL_SPEC.md` |
| 信息架构和功能归属 | `docs/SPARK_FUNCTION_INVENTORY.md` |
| 整店翻译 / 跨 TSF | TSF 根 `AGENTS.md` 与 `packages/translation-core/*`（Spark 仅图片翻译、兼容清理、Admin 只读观测） |
| 复杂协作节奏（有分叉时） | `.cursor/skills/deliberate-collab/SKILL.md` |

文档名和路径区分大小写时以磁盘实际文件为准。不要引用不存在的旧文档（例如旧版说明中的 `docs/generateDescription.md` 或 `docs/agent-run-log.md`）。

用户粘贴飞书 Wiki/Docx 链接时，必须先读取正文再分析：

```powershell
node scripts/fetch-feishu-doc.mjs "<飞书链接>"
node scripts/fetch-feishu-doc.mjs "<飞书链接>" --out ./docs/tmp/<name>.md
```

凭证仅从根目录环境变量 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 读取；禁止把值写入日志、文档或提交。

## 7. 前端和任务 UI 约束

- 一级导航由 `app/config/appEntry.server.ts` 按环境分流：点侧栏应用名「Spark」进 `/app`（不设「首页」导航项）。`NODE_ENV=prod|production` 另仅展示「账户与订阅」；测/本地另展示助手 / 首页 v1 / Today / Health Monitor / Studio / Tasks / 账户 / Settings。聊天输入区不展示 Playbook 快捷条；计费入口在 `/app/account`，不在 Settings hub。旧 `/app/home-v2` 重定向到 `/app`。隐藏的路由在 prod 仍可直达 URL（仅导航不展示）。
- Ask 工作台上下文工具仅保留商品 / 订单 / 文章 / 文件；不要恢复富媒体或约束选择器 UI，也不要加回未接线的「生成任务建议」工具栏按钮。
- 首页（`HomeV2Panel`）与对话输入区共用 `app/lib/workspaceRecommendedActions.ts` 的推荐操作，当前四组：经营诊断（只读；含 SEO 体检）/ 商品优化、图片生成（AI 生成内容）/ 批量编辑（试算→审核→写回；含按规则改结构化字段的批量调价、批量打标、批量上下架、批量改自定义字段，以及按上传表格改价的价目表导入、改成本的成本价导入与改某地点可售量的库存导入；批量改 SEO / 批量调整合集已从推荐入口下线，后端 Skill 仍保留）。新增能力要在这里登记才会出现在首页。首页刻意只保留一句行动号召，不要再往问候下方、卡头或推荐区加副标题、徽标与分组描述——那些描述会复述下面的行标题，是这一版专门删掉的。改这里时 `HomeV2SsrFallback` 要同步（占位块数量与 grid 口径需与真实首页一致，否则 hydrate 后列数跳变）。
- 优先复用 `DestinationPage`、`SegmentedPageTabs`、`DialogShell` 和 `pagePrimitives.module.css` 等共享页面原语。
- 所有任务列表 Card 必须以 `app/routes/component/aiTask/AITaskCardShell.tsx` 为基础。Shell 负责容器、header、状态、进度、动作区和日志挂载；业务 Card 负责文案、进度计算、actions 与业务状态。
- **prod 导航没有任务页，所以 `pending_review` 任务的验收入口必须在对话内闭环**：`TaskProposalCard` 确认 → `TaskRunChatCard` 轮询 `/api/ai-task` → 进度卡「去审核」在 `ChatPanel` 的 `DialogShell` 里开审核详情，不跳 `/app/tasks`。能否走对话内审核由 `app/routes/component/chat/chatInlineReviewTasks.ts` 的白名单决定（当前 `product_improve` / `picture_translate` / `image_generation` / `bulk_price_edit` / `bulk_tag_edit` / `bulk_status_edit` / `bulk_collection_edit` / `bulk_seo_edit` / `bulk_metafield_edit` / `bulk_price_import` / `bulk_cost_import` / `bulk_inventory_import`）。新增需要审核的任务类型时，白名单、`ChatPanel` 的渲染分支、以及一个签名为 `{ task, onBack, showBackButton?, onTaskUpdated? }` 的 `XxxTaskDetailPage` 三者要一起加；详情组件保持纯 props、不依赖任务页 loader，这样任务页弹窗与对话弹窗能共用同一份 UI。
- `TaskProposalField` 里的 `collection`、`location` 与 `metafieldDefinition` 属于**远端资源字段**（`isResourceOptionField` 判定）：选项由 Skill 开卡时预取，卡片渲染成带关键词筛选的下拉，未选中就不允许提交。展示层一律用 `field.options` 里的 label 换成人看得懂的名称（`formatTaskProposalParamSummary` 与 `buildTaskRunPayload` 都已处理），不要把裸值丢进 i18n 查表或直接显示给商户。前两者的值是 GID，`metafieldDefinition` 的值是 `namespace.key`（definition GID 那条路已 deprecated）。以后接其它资源选择器沿用这个类型分支，不要每加一个资源就复制一套 UI。
- 标准参考：`app/routes/component/productImprove/ProductImproveTaskCard.tsx`、`app/routes/component/imageStudio/ImageGenerationTaskCard.tsx`、`app/routes/component/imageStudio/PictureTranslateTaskCard.tsx`；广告同步卡参考 `app/routes/component/adsCatalog/AdsCatalogTaskCard.tsx`。
- 用户可见文案必须同步维护 `app/locales/zh/common.json` 与 `app/locales/en/common.json`，不得在组件中新增只覆盖一种语言的硬编码文案。
- 使用现有 Shopify Web Components、Ant Design 和样式体系；不要引入第二套设计系统。
- 页面 loader/action、API 和 Webhook 必须沿用 `authenticate.admin(request)` 等现有鉴权边界；不要为了复用把 server secret 或 Admin API 客户端带入浏览器代码。
- `.server.ts` 模块保持服务端专用。组件中不要直接导入 Node-only、Prisma、Azure、Redis 或 secret 配置。

## 8. 数据库与迁移规则

- Prisma schema：`prisma/schema.prisma`；生成目录：`app/generated/prisma/`。
- 修改 schema 后至少运行 `npx prisma generate` 和适当的 schema 校验/测试。
- Turso 运行时由 `app/db.server.ts` 读 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`（测/产各环境各自配值，无 `TURSO_TARGET`）；Prisma datasource 的 `DATABASE_URL` 主要用于 CLI、本地 SQLite 和生成流程。
- 测试/生产 Turso 迁移使用仓库脚本：`npm run turso:migrate:test`、`npm run turso:migrate:prod`。
- 不要把 `prisma migrate deploy` 直接指向 `libsql://`。
- 当前迁移目录为单条 baseline：`prisma/migrations/20260829010320_init`（2026-08 squash，旧增量已删除）。测/产 Turso 需硬重置后 `turso:migrate:*` 对齐；脚本见 `scripts/turso-hard-reset.mjs`（产库须 `--confirm-prod`）。本地也可 `prisma db push`。不要再把已删除的历史 migration 加回来。
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
- 鉴权边界：`admin/server/middleware/auth.ts`；收入、Pixel logs、TSF billing/revenue/ROI、OpenRouter 探测等 owner-only 路由在 `admin/server/index.ts` 使用 `requireOwner`。登录为三人身份（Yewen / Allen / Zhuangze）+ 各人密码（`ADMIN_SECRET_YEWEN` / `_ALLEN` / `_ZHUANGZE`）；Yewen、Allen 为 owner，Zhuangze 为 user。顶栏显示姓名，不展示 Owner/User 字样。
- 主要 API 路由族：Spark 运营（overview/shops/usage/capabilities/subscriptions/revenue/agent-runs/billing-rules/pricing-workbench/todos/ops-checklist/visit-source/support/app-logs/pixel-logs/shop-profile、`spark-credits` 额度查询与系统奖励、`spark-billing` 账单总览）、TSF 观测（`/api/tsf/*`：overview/shops/usage/subscriptions/packs/billing/shop-profiles/language-coverage/revenue/roi/credits）、翻译运维只读/修复（`/api/translations`、`/api/translation-ops`、`/api/shopify-translation`）、Redis Explorer、OpenRouter 探测。`admin/server/routes/` 下所有路由文件都在 `admin/server/index.ts` 挂载，没有孤儿路由。翻译任务内容查看（`/translations/:id/content*`）用 `includeLiquid` 拼虚拟 module `CUSTOM_LIQUID`（`jobModulesWithLiquid`，与 TSF Worker 对齐），不要只读 Cosmos `job.modules`。
- 前端页面路由见 `admin/src/App.tsx`；Spark 侧栏含「账单总览」`/billing`、「用户额度」`/credits`、「定价工作台」`/pricing-workbench`；除下文详述的几个页面外还有 `/translations`、`/shop-translation`、`/translation-ops`、`/shopify-translation`、`/translate-v4-support`、`/tsf/billing`、`/tsf/packs`、`/tsf/shop-profiles/:shop`、`/redis-explorer`。改 Admin 导航前先读该文件，不要凭本节清单推断。
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
- 运维/交付 npm 脚本：`npm run deploy:test`（Render 测试环境）、`npm run push:pr`（提交 + push + 建 PR）、`npm run orders:create`（生成测试订单）、`npm run turso:migrate:test|prod`。完整清单以 `package.json` scripts 为准。
- 主应用服务端运行需要 Shopify 和 Turso 相关变量；AI、Cosmos、Blob、Redis、SES、飞书等能力按功能依赖相应变量。
- 单元测试位于 `tests/`（Vitest）。
- 不读取或输出 `.env` / `.env.prod` 的值。只记录所需变量名。
- 诊断脚本默认叠 `.env.test` → `.env`（`scripts/lib/loadEnv.mjs`）；查产需显式 `--env=.env.prod`。交互约定见 `.cursor/rules/env-prod-safety.mdc`。

### 脚本清单（`scripts/`）

Package-backed：

- `scripts/turso-migrate.cjs` — `npm run turso:migrate:test|prod`
- `scripts/turso-hard-reset.mjs` — 硬删 Turso 全部用户表（默认测环境；产库需 `--env=.env.prod --confirm-prod`），配合 migration squash 后重建
- `scripts/cursor-push-pr.mjs` — `npm run push:pr`
- `scripts/deploy-test-render.mjs` — `npm run deploy:test`
- `scripts/create-test-orders.mjs` — `npm run orders:create`

运维 / Agent 入口（无 npm，按需手跑）：

- `scripts/fetch-feishu-doc.mjs` — 拉取飞书 Wiki/Docx（§6）
- `scripts/query-turso.mjs` — 快速查 Turso 表（默认测环境）
- `scripts/lib/loadEnv.mjs` — 上述脚本共用的 env 叠载与 Turso/Redis/Cosmos 解析
- `scripts/generate-notification-html-templates.cjs` — 重生 SES 邮件 HTML（`app/server/notifications/tencent-cloud-html/`）
- `scripts/test-pixel-ingest.mjs` — 向 `/api/pixel-ingest` 发测试 envelope
- Meta / TikTok 广告沙盒：`check-meta-sandbox-posts.mjs`、`list-meta-sandbox-pages.mjs`、`diagnose-meta-sandbox-seed.mjs`、`list-tiktok-sandbox-identities.mjs`、`seed-tiktok-sandbox.mjs`、`upload-tiktok-sandbox-creative.mjs`

CI：

- `.github/scripts/render-deploy-and-wait.sh` — `spark-deploy.yml` 部署轮询；飞书部署通知仅 Spark Prod / Admin Prod，测环境不发

不要恢复已删除的 Render 日志 digest 脚本（`render-daily-log-digest` 等）或缺失的 `turso-drop-schema-*` npm 入口。临时探针放仓库外，或用完即删；`scripts/tmp*` 未跟踪文件勿擅自纳入改动。

## 11. 验证参考（按需）

按风险自选，非强制流程。常用命令：

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

| 改动 | 常选 |
|---|---|
| 纯工具函数/服务 | 对应 Vitest + `typecheck` |
| 路由/API/服务端 | 相关测试 + `typecheck` + `build` |
| 前端/i18n | `typecheck` + `build` |
| Prisma / 计费 / 任务状态 | 相关测试 + `prisma generate` + `typecheck` + `build` |
| Admin | `cd admin && npm run build` |

## 12. 工作纪律

### 思考与执行节奏

- 深入思考会增加延迟，只在能实质提升结果质量时展开，典型是需要多步推理的问题；拿不准时直接回答。
- 选定一个方案就执行到底。除非遇到与判断直接矛盾的新信息，不要反复推翻已定的做法；先走通一条路、失败了再修正，比在两个方案之间来回权衡更快。
- 打算调用多个彼此无依赖的工具时一次全部并行发起。例如要读三个文件就同时发三次读取，不要串成三轮。只有参数依赖上一步结果的调用才串行，并且不要用占位值猜参数。
- 不推测没打开过的代码。用户引用了具体文件就先读再答；对调用链、schema、组件行为下结论前先查，查不到就明确标成假设，不编造路径或 API。
- 避免过度设计：只做被明确要求或确实必需的改动。修 bug 不必顺手清理周边代码，简单功能不必预留配置项；不为不可能发生的场景加防御分支，只在系统边界（用户输入、外部 API）做校验；不为一次性操作抽 helper。
- 不给没改过的代码补注释、docstring 或类型标注；只在逻辑不自明处写注释。

### 边界与纪律

- 只改需求相关文件；不顺手格式化、重命名或清理无关代码。
- 工作树可能不干净。用户改动优先，禁止使用 `git reset --hard`、`git checkout --` 或删除未跟踪文件来“清理”环境。遇到阻碍时不要拿破坏性操作当捷径：不绕过校验（例如 `--no-verify`），不丢弃看不懂的在途文件。
- 按可逆性分级决定是否先问用户。本地可逆操作（改文件、跑测试与 lint）可直接做；以下三类先确认再动手：
  - **破坏性**：删文件或分支、drop 表、`rm -rf`
  - **难以撤销**：`git push --force`、`git reset --hard`、修改已发布的 commit
  - **他人可见**：推分支、创建 PR、评论 issue、发邮件或飞书消息、改共享基础设施、修改 Shopify 真实数据、生产迁移
- 上一条里的部署、生产迁移、发送真实邮件/飞书消息、修改 Shopify 真实数据、推分支与创建 PR，只在用户明确要求时执行，不因「看起来该做」而主动发起。测/产环境的读写口径另见 `.cursor/rules/env-prod-safety.mdc`。
- 搜索优先使用 `rg` / `rg --files`；先追真实调用方，再删除 wrapper、兼容层或旧 API。
- 不猜接口。Shopify GraphQL、scope、版本或平台约束可能变化时，使用仓库配置的 Shopify 开发工具或官方文档核实。
- 新增环境变量时同步更新相应配置校验和文档，只记录名称、用途、是否必需，不提交 secret。
- 设计跨存储或跨仓库方案时，先画清所有权和调用路径；Telemetry、Agent 运行摘要和业务对象默认分开存储。

## 13. 维护本文件

当以下事实发生变化时，相关代码改动必须同步更新本文件：

- 一级导航、主要路由或服务边界变化；
- Ask 工作台上下文工具清单（商品/订单/文章/文件）增减；
- 新增/删除可部署应用、worker、扩展或外部存储；
- Partner 应用 toml、webhook 订阅、分发方式（Public / Custom）或发布姿态变化；
- package scripts、Node 版本或常用验证命令变化；
- 新增设计/交互/计费/迁移硬约束；
- 领域文档重命名或迁移。

更新时以代码扫描结果为准，删除过时描述，不把一次性排错记录、机器路径、密钥值或长篇实现细节堆进本文件。
