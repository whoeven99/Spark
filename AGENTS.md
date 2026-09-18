# AGENTS.md

本文件是编码 agent 在 `Spark` 仓库中的入口和长期维护的代码导航。它适用于仓库根目录及所有子目录；若某个子目录以后新增更具体的 `AGENTS.md`，则子目录文件在其作用域内优先。

## 0. 怎么用本文件

本文件是仓库地图与硬门禁，不是逐步执行的流程清单。默认：查代码 → 直接做 → 按风险自选验证。有产品/技术分叉或不可逆操作时再停下来对齐；**涉及用户可见交互/布局的 UI 改动须先出交互样例**（见第 7、12 节），用户看过再改产品代码。复杂协作可按需参考 `.cursor/skills/deliberate-collab/SKILL.md`。

若本文件已随上下文注入，不必为「怕旧副本」再完整重读；只有不确定或仅凭历史记忆时再打开。不推测没打开过的代码。

若本文件、旧文档和当前代码冲突，优先级为：**当前代码与配置 > `package.json` / Prisma schema > 本文件 > 领域文档 > README**。发现漂移时，应在本次改动范围内同步更新本文件或对应文档。

## 1. 项目现状

Spark 是嵌入 Shopify Admin 的 AI 运营应用，当前仓库有两个可独立运行的应用和 Shopify 扩展：

- **主应用（仓库根目录）**：React 18、React Router 7 文件路由、Vite、Shopify App Bridge / Web Components、Node 服务端，默认由 Shopify CLI 启动。
- **Admin 后台（`admin/`）**：Express API（本地默认 `3099`）+ Vite React 前端（本地默认 `5174`）。它有独立的 `package.json`、依赖和构建流程。
- **Web Pixel 扩展（`extensions/ciwi-spark-web-pixel/`）**：采集 Shopify analytics/custom events，经主应用 `/api/pixel-ingest` 上报。**审核期** `shopify.extension.toml.off`，不部署。
- **Theme App Extension（`extensions/spark-tiktok-pixel/`）**：Shopify 限每应用仅 1 个 theme 扩展，所以同一包内放三个相互隔离的 App Embed：TikTok Pixel、Google Remarketing、Ciwi Image Switcher。**不要再新增第二个 `type = "theme"` 扩展目录。** **审核期** 整包 `shopify.extension.toml.off`，`blocks/*.liquid` 均在 `_disabled_pixel_blocks/`，不部署；过审后还原 toml 与 liquid。各 Embed 的配置下发口径与 Google Pixel 向导见 `app/server/adsCatalog/agent.md`。

重要边界：

- 当前仓库**没有 `worker/` 目录或 Translation Worker 可部署服务**。
- 整店/多语言翻译任务及共享翻译核心归 TypeScriptFrontend（TSF）所有；`app/server/ai/skills/index.ts` 不再注册整店翻译工具，Spark 也不再保存翻译规则或 Worker 实现副本。
- Spark 内仍有**图片翻译**功能，以及 `app/server/translation/translateBlobStore.server.ts` 等少量兼容清理、Admin 只读观测代码。`/app/studio/translate` 当前只重定向到 `/app/studio/copy`，不要把图片翻译、兼容 Blob 读取或 Admin 运维页误判为整店翻译运行时。
- Shopify 订单、退款、客户、库存、履约同步在主应用 `app/server/shopify/sync/` 与 Webhook 中实现。历史订单回补不是独立 worker：安装后自动回补（`ensureInstallOrderBackfill`，默认近 `SPARK_ORDER_BACKFILL_DAYS` 天）；对话诊断卡可 `POST /api/order-backfill`；测环境页面入口仍是 `/app/settings/data`。与 toml 里的 webhook **订阅**是两回事：路由在仓库里，未 `shopify app deploy` 订阅则增量进不了库。
- 工作树中可能出现 `scripts/tmp/` 下临时排查脚本（该目录已 gitignore）；除非用户明确要求，禁止删除、覆盖或纳入改动。

发布姿态与 Partner 应用（已对商家开放）：

- 仓库常用 toml：`shopify.app.test.toml`（AiAssistant-Test → Render Test）、`shopify.app.prod.toml`（→ Render `Spark-Prod` / `spark-prod.onrender.com`）、`shopify.app.yw.toml`、`shopify.app.spark-zz.toml`（本地）；另可能有其它 `shopify.app.*.toml`。CI（`spark-deploy.yml`）可手动勾选发布 Spark Test / Spark Prod / Admin / Admin Test。**从零发布新 Shopify App 的步骤见 `docs/SHOPIFY_APP_PUBLISH.md`。**
- **改了 toml 的 `scopes` 必须对该配置 `shopify app deploy`，且已安装的店铺会走一次重新授权**（Shopify 在下次进应用时弹权限页，商户不点同意就用不了新能力）。prod 现有 scope 里 `read_inventory` 是为真实 COGS / 利润报表加的；不要为「以后可能用得上」提前申请用不到的 scope，审核时要逐条解释。
- **给商户用的那个 toml 必须自己订阅订单类 webhook，改完后对该配置 `shopify app deploy`。** `shopify.app.prod.toml` 已订阅 `orders/paid|cancelled`、`refunds/create`、`fulfillments/create|update`（另有订阅/购包/卸载/scope/GDPR）。**不订阅** `inventory_levels/update`（第一版不做库存镜像）。`shopify.app.test.toml` 与 yw / spark-zz 另订库存增量。只改 toml 不会生效。
- Shopify **分发方式选定后不可改**。要装互不相关的真实店且走现有 Shopify Billing：必须是 **Public**（Listed 可搜索，Unlisted 只发链接；都要 App Store 审核）。**Custom** 只能装单店或同一 Plus 组织（或 transfer-disabled 开发店），**不能**用 Shopify 应用计费，也不能再改成 Public。不要为每个商家复制一个 Custom 应用。细节见 `docs/ROADMAP.md` **第八节**。
- 卸载目前：通知 + **归档快照到 Blob** 后从 Turso **删除该店业务数据**（含 Session、订单镜像、对话、广告凭证、客服、`Account`、`CommonEventLog` 等）；`PromoClaimLedger` / `ReferralClaim` / `ReferralInstall`（shopHash）保留以防安装福利与推荐码被薅。GDPR `shop/redact` 再跑一遍幂等清理；`customers/redact` 擦除客户镜像 PII。改 toml 后须对该配置 `shopify app deploy`。公开上架仍缺隐私政策页（需披露安装福利防滥用 hash 账本）。
- 新装默认经 `ensureInstallPromoTokens` 自动发放安装福利 Token（账户页营销活动，默认 1,000,000；每店每活动一次，账本按 shopHash），无需手动领取。**推荐码**在订阅时填写，第一次带码且订阅确认成功后再入账一份 Token（一店一码，Admin `/referral-codes` 可配上限，默认 1,000,000）。Admin 可复制安装链接 `{SHOPIFY_APP_URL}/r/{CODE}`，点开后经 Shopify 安装；OAuth / 进应用时记 `ReferralInstall`（先到先得），卸载只擦明文店名。
- 风控链路、回收期/长期 ROI，以及 Health Monitor「ROI 情况（短期和长期）」当前**不展示**；短期 ROI 仍在经营页，等产品公式再改计算。详情见 `docs/ROADMAP.md` 第七节。
- 独立告警中心（`app/server/ai/skills/alerts/`）与统一写回治理层（`app/server/ai/writeBack/`）**尚未建立**；广告侧订单 UTM 归因已有，点击 ID（gclid/fbclid/ttclid）↔ 订单 join 未做。物流承运商凭证现为进程本地 JSON（`.data/logistics-provider-credentials.json`），Render 重启会丢，不要当生产核心路径。公开上架材料与缺口清单以 `docs/ROADMAP.md` 第七、八节为准。

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
├─ admin/                     独立 Express + Vite 管理后台（细则见 `admin/AGENTS.md`）
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
| 首页 | `/app` | `app._index.tsx` + `HomeV2Panel`（问候下一句 `DailyPulse` + 本页直接聊天）；旧 `/app/home-v2` 重定向至此 |
| 助手（兼容） | `/app/assistant` | 重定向到 `/app`；测/产导航都不展示 |
| 首页 v1 | `/app/home-v1` | `app.home-v1.tsx` + `HomePanel`（原首页经营概览；提问跳转 `/app`；prod 导航可不展示） |
| Today | `/app/today` | `app.today.*`：`_index` 经营驾驶舱；详情页含 `revenue` / `profit` / `cost` / `roi` / `traffic` / `conversion` 等。`orders` / `diagnosis` / `insights` 为兼容重定向（分别到 revenue / health-monitor 或 Today 详情）。**测环境页面入口；prod 走对话，不进导航** |
| Health Monitor | `/app/health-monitor` | `app.health-monitor.tsx`，站点健康/可信度监测（总览走 `ensureDailySnapshotOverview`，`?view=detail` 才走 `ensureDailySnapshot`）。**测环境页面入口；prod 走对话，不进导航** |
| Studio | `/app/studio` | `app.studio.*`，工具目录（测环境导航）；`copy` 商品文案，`image` 图片生成/图片翻译；`translate` 旧入口重定向到 `copy`。**prod 走对话开任务，不进导航** |
| 创作 | `/app/create` | `app.create.tsx` + `CreatePage`：一级是能力目录，选中后在本页开工作区（商品文案 / 生成图片 / 翻译图片文字），不跳 Studio；能力清单登记在 `app/lib/createCapabilities.ts`（当前 `ready` 3 + `chat` 4；`inventory` 等 10 个 domain 仍空）；测/产导航都不展示，URL 仍可直达 |
| 任务 | `/app/tasks-v2` | `app.tasks-v2.tsx` + `TaskListV2Page`：两行列表（状态/对象 + 结论句/细进度条），当前/历史合在一页、严格按时间倒序（`/api/unified-tasks?view=all&include=ai&sort=time_desc`），不展示经营任务与定时任务；点行先选中，预览/写回仍走对话；prod 与测/本地导航都露出。旧 `/app/tasks` 重定向到这里 |
| 广告 | `/app/ads` | `app.ads.tsx` 左栏能力目录 + Outlet（样例 B）：总览 / 投放表现 / 归因 / 连接·同步目录 / 创建·编辑 / 目录同步任务；Pixel 审核期左栏隐藏。旧 `/app/ads-catalog`、`/app/studio/ads*`、`/app/insights/performance` 重定向至此。**仅测/本地导航；prod 不进导航，URL 仍可直达** |
| 账户与订阅 | `/app/account` | `app.account.tsx` → `BillingPage`（套餐与 Token 额度）；旧 `/app/settings/billing` 重定向至此 |
| Settings | `/app/settings` | `app.settings.*`：物流、GA4、GSC、PageSpeed、数据回补、ShopifyQL 报表、反馈等；计费已迁出到「账户与订阅」。广告入口已迁到一级「广告」`/app/ads`（旧 `/app/ads-catalog` 重定向）。**仅测环境导航；prod 不把配置 hub 做成一级入口** |

兼容层（不占一级导航）：`/app/insights*` 与旧投放洞察路径多为重定向到 Today 或 Ads Catalog；不要把 Insights 当作当前一级目的地。旧 `/app/home-v2` 重定向到 `/app`。

Ask / 首页工作台上下文工具（聊天输入区）当前仅：**商品 / 订单 / 文章 / 文件**（`ContextTool = product \| article \| order \| file`）。已移除输入区 Playbook 快捷条；遗留 `prefillConstraint` query 只做 URL 清理、不再写入上下文。任务确认卡仍由 agent/SSE 的 `task_proposal` 产出。四个只读 Playbook（`shopHealthCheck` / `productLaunchPipeline` / `inventoryRiskMitigation` / `refundIssueReview`）仍在 `app/server/ai/playbooks/` 注册，但 `PLAYBOOKS_ENABLED=false`，**不对商户开放**；恢复前勿假设对话能触发。

Settings hub 之外还有若干可路由但不在 hub 卡片里的嵌入式页面：`/app/logistics/fedex/config`、`/app/logistics/sf/config`（承运商凭证表单，由 `app.settings.logistics.tsx` 内链）、`/app/feedback/suggestion`、`/app/ads/google-ads/start`、`/app/ads/google-merchant/start`（OAuth 启动页）。

关键 HTTP 入口。第一组是不能绕过的门禁，第二组只给定位线索（签名与参数 `rg` 路由文件）。

**门禁：**

- `POST /api/bulk-price-edit` / `bulk-tag-edit` / `bulk-status-edit`：分别是全仓库**唯一**会改 Shopify 商品价格 / 标签 / `status` 的地方。门禁一致：必须带 `confirm: true` 且任务处于 `pending_review`；Agent 回合内（chat-stream / Skill / dry-run）禁止走到这里。上下架只写 `ACTIVE` / `DRAFT`，不碰销售渠道发布。
- `POST /api/product-import`：导入商品写回入口，门禁同上；编排已有 apply，不新增 GraphQL mutation。写回列：标题/正文、价格、成本、Tags、状态、Vendor/类型/SEO、Handle、合集、Metafield（有 definition 的标量及 `list.single_line_text_field`）、复制、归档、删除。不做：库存数量、用表格新建商品、销售渠道。删除需审核页额外确认。
- `GET /api/daily-pulse`：首页问候下一句经营结论。只 peek 当日快照，**不跑 30 天诊断**。
- `GET|POST /api/health-diagnosis`：对话内健康诊断卡。总览只走 `ensureDailySnapshotOverview` / peek，不要把卡接到完整 30 天诊断。
- `/api/unified-tasks`：`sort=time_desc` 关掉定时任务置顶、纯按更新时间倒序（Tasks v2 用）；**缺省仍是定时任务在前的旧口径，不要改缺省值**。
- `GET /r/:code`（推荐码安装短链，写 cookie 后跳转 `oauth/install`）与 `POST /api/internal/credit-migration`（翻译 App 迁入积分，HMAC + `CREDIT_MIGRATION_SECRET`）都**没有 Shopify session**，改动时不要假设有 `authenticate.admin`。

**其余入口：**

- `POST /chat-stream` → `app/server/chat-stream.ts`，SSE 聊天入口。
- 任务：`/api/ai-task*`、`/api/batch-ai-tasks`、`/api/task-proposal`（聊天流 `task_proposal` 卡片的估算/执行入口，不是独立工具栏按钮）、`POST /api/order-backfill`（只写本店订单镜像，不改 Shopify 订单）。
- 商品与内容：`/api/product-improve`、`/api/product-quality-score`、`/api/update-product-description`、`/api/product-search`、`/api/shop-locales`、`/api/shopify/objects`。
- 视觉：`/api/generate-image*`、`/api/picture-translate*`、`/api/image-proxy`。
- 广告：`/api/ads-catalog*`、`/api/ads-create*`、`/api/ads-edit*`、`/api/ads-insights*`、`/api/ads-overview`；OAuth 回调 `ads.*.callback.tsx`。细则见 `app/server/adsCatalog/agent.md`。
- 外部分析：`/api/ga4/*`、`/api/gsc/*`（auth-url、属性/站点发现、连接状态与断开）、`POST /api/pagespeed`（平台 API Key，不落库）。
- 工作台：`/api/ai-capabilities`（由 Skill Manifest 派生）、`/api/upload-file`、`/api/conversations*`、`/api/files*`、`/api/context-resources*`（product / article / order）、`/api/automation-overview`。
- 其它：`/api/support`、`/api/feature-track`（写入 Aliyun SLS）、`/api/pixel-ingest`。
- `webhooks.*.tsx`：Shopify 卸载、scope、订阅、购包、订单（paid/cancelled）、退款、库存、履约、GDPR 合规（`/webhooks/compliance`：`customers/data_request` / `customers/redact` / `shop/redact`），以及 Google Merchant 商品状态与 Meta Catalog Webhook；公共执行/调试工具在 `app/server/webhook/`。

React Router 使用 `app/routes.ts` 中的 `flatRoutes()`；新增或改名路由时必须按文件路由规则核对最终 URL，并检查父布局/索引路由关系。

## 4. 服务端领域导航

| 需求 | 首要代码入口 |
|---|---|
| 聊天请求与 SSE | `app/server/chat-stream.ts`、`app/server/chatPayload.server.ts` |
| Agent 图、模型、提示词 | `app/server/ai/core/shopChatGraph.server.ts`、`agentStream.server.ts`、`shopAssistantPrompt.ts` |
| Skill / Tool 注册 | `app/server/ai/skills/index.ts`、`app/server/ai/core/toolRegistry.server.ts` |
| Playbook 与能力目录 | `app/server/ai/playbooks/`（`PLAYBOOKS_ENABLED=false`，商户侧未开）、`app/server/ai/core/playbookRegistry.server.ts`、`skillManifest.server.ts` |
| AI 任务执行与日志 | `app/server/aiTask/`（`aiTaskStore` 状态、`aiTaskLogger` 日志、`aiTaskEventBus` SSE、`concurrencyLimiter` 并发、`batchTaskCreate` 批量）、各 Skill service |
| 商品文案与质量优化 | `app/server/productImprove/` |
| 批量编辑（调价 / 打标 / 上下架）与商品管理（导出、导入）+ 只读 SEO 体检 | **细则见 `app/server/bulkEdit.agent.md`**（`.cursor/rules/bulk-edit-agent.mdc` 按路径自动加载）。全族统一四层：纯算 `app/lib/` → 只读 reader → 试算 dry-run（零 mutation，落 `pending_review`）→ 写回 apply（该 mutation 的唯一调用处）。商户入口是导出 + 导入；改字段/SEO、标题正文、合集、复制、归档、成本、Handle、Metafield、删除没有独立入口，只作为导入内部 apply |
| 商品目录和对象查询 | `app/server/productSearch/`、`app/server/shopify/productSearch.server.ts`、`app/server/shopify/shopifyObjectList.server.ts` |
| 图片生成 | `app/server/imageGeneration/` |
| 图片翻译 | `app/server/pictureTranslate/`、`app/server/imageMapping/`（原图 → Blob 映射，供 Image Switcher 替换） |
| 视觉模型凭证（火山引擎） | `app/server/volcengine/volcCredentials.server.ts`，被图片生成与图片翻译调用 |
| 视觉工具页聚合 | `app/server/visualTools/` |
| 广告 Catalog / 创建 / 编辑 / 洞察 | `app/server/adsCatalog/`、`adsCreate/`、`adsEdit/`、`adsInsights/`。**细则见 `app/server/adsCatalog/agent.md`**（`.cursor/rules/ads-agent.mdc` 按路径自动加载）：枚举缓存的适用边界、Google Ads 凭证失效判据、洞察读库/回源窗口、审核计数与链路健康 |
| Google Analytics 4 | `app/server/googleAnalytics/`（`ga4Api.server.ts` 读数、`ga4Credentials.server.ts` OAuth 凭证） |
| Google Search Console | `app/server/googleSearchConsole/`（`gscApi.server.ts`、`gscCredentials.server.ts`） |
| PageSpeed Insights | `app/server/pageSpeed/`（PSI v5 `fetch`，平台级 `GOOGLE_PAGESPEED_API_KEY`，结果不落库） |
| ShopifyQL 官方报表 | `app/server/shopifyql/`（`shopifyqlQuery` + 七域 preset：销售/退款/成本利润/客户/库存/履约/店面漏斗，入口 `/app/settings/shopify-reports`，需要 `read_reports` 与 Protected Customer Data Level 2） |
| 物流承运商凭证 | `app/server/logisticsCredentialStore.server.ts` |
| 统一任务列表 | `app/server/unifiedTask/` |
| 任务建议/聊天卡片 | `app/server/taskProposal/`、`app/server/ai/core/resolveChatCardIntent.server.ts`（Skill/SSE 产出 `task_proposal` → 前端 `TaskProposalCard` → `/api/task-proposal`） |
| Today/运营诊断/ROI | `app/server/operations/`、`app/server/automation/`。两个入口不要混用：只读指标/诊断项/任务走 `ensureDailySnapshotOverview`（命中当日快照时不重算），需要 `detail` 明细对象才用 `ensureDailySnapshot`（必然触发一轮 30 天全量诊断）。首页问候脉冲走 `peekDailySnapshotOverview` / `loadHomeDailyPulse`（绝不重算 30 天诊断；有快照出结论，无快照时仅回补中或订单为 0 才给句子）。「近 7 天」经营页与健康度共用 UTC 完整日、不含今天（`app/lib/observationWindow.ts`）；展示按店铺 `ianaTimezone` 格式化 |
| 对话内健康诊断 / 订单回补 | `app/routes/api.health-diagnosis.ts`、`app/routes/api.order-backfill.ts`、`app/routes/component/chat/HealthDiagnosisChatCard.tsx`；待办只读追问 `app/lib/healthDiagnosisTodoPrompt.ts`，相关订单摘要 `app/lib/healthDiagnosisRelatedLines.ts` |
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

AI 主链路应从真实代码确认，通常为：首页工作台（`/app`）`useChatStream` → `POST /chat-stream` → `app/server/chat-stream.ts` → `invokeChatAgentStream`（`app/server/ai/core/agentStream.server.ts`）/ LangGraph → 全局 Tool Registry → SSE 事件回传（可含 `task_proposal`）。

## 5. 数据与外部系统边界

- **Turso / libSQL + Prisma**：业务主数据。模型在 `prisma/schema.prisma`，包括 Session、Account/订阅/计费、AITask、订单/退款/客户/库存/履约镜像、WorkspaceFile、Conversation/Message、运营诊断、成本/ROI、支持会话、广告平台凭证（AdPlatformCredential）、广告实体与日指标（AdEntity / AdMetricDaily / AdInsightsSync）、商品审核状态（GmcProductStatus / MetaProductStatus）、推荐码（ReferralCode / ReferralClaim / ReferralInstall，卸载后 claim 与安装归因按 shopHash 保留）等。广告与审核状态相关的约定：
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
| Partner 分发、上架门禁 | `docs/ROADMAP.md` 第七–八节 |
| Tools 页面、任务生命周期、确认/审核/进度交互 | `docs/INTERACTION_DESIGN.md` |
| 前端视觉、布局、组件样式 | `docs/DESIGN.md` |
| 计费、订阅、购包、token 池、Webhook | `app/server/billing/agent.md` |
| 批量编辑、SEO 体检 | `app/server/bulkEdit.agent.md` |
| 广告 Catalog / 创建 / 编辑 / 洞察、Theme App Embed 配置 | `app/server/adsCatalog/agent.md` |
| Admin 后台路由、鉴权身份、各页面口径 | `admin/AGENTS.md` |
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

- **UI 先出交互样例，再改产品代码。** 新增、改信息架构、改主路径交互或布局时：先对照现有页面做一份可点的交互样例（优先 Cursor Canvas，放工作区 `canvases/`，回复里用 markdown 链接打开），覆盖关键状态（正常 / 空 / 异常 / 点开后）。样例对齐当前 IA（prod 对话优先、测环境页面优先）和 `docs/DESIGN.md` 的疏密，不要另起一套视觉。用户看过或明确说可以做之后，再改 `app/` / `admin/` 里的真实 UI。纯文案替换、修回归、复现已有交互的像素级修正不必出样例。
- **prod 对话优先，测环境页面优先。** 给商户用的生产入口尽量在对话里完成功能（首页 `/app` 聊天、推荐操作、`task_proposal` 确认卡、对话内审核/结果），不要把测环境那套独立功能页（Today / Health Monitor / Studio / Settings / 广告）加进 `PROD_NAV`。测/本地才用页面完成同一批能力，便于开发和验收。例外两类：`/app/tasks-v2`（异步任务台账）、`/app/account`（Shopify Billing）。`/app/ads` 等配置页可以 URL 直达，但不占 prod 一级导航。
- 一级导航由 `app/config/appEntry.server.ts` 按环境分流：点侧栏应用名「Spark」进 `/app`（不设「首页」导航项）。`NODE_ENV=prod|production` 展示「任务」与「账户与订阅」；测/本地另展示首页 v1 / Today / Health Monitor / Studio / 任务 / 广告 / 账户 / Settings。
- Ask 工作台上下文工具仅保留商品 / 订单 / 文章 / 文件；不要恢复富媒体或约束选择器 UI，也不要加回未接线的「生成任务建议」工具栏按钮。
- 首页（`HomeV2Panel`）与对话输入区共用 `app/lib/workspaceRecommendedActions.ts` 的推荐操作，当前五组：经营诊断（只读；今日店况 + SEO 体检）/ 商品优化（文案、质量、图片翻译）/ 商品管理（导出、导入）/ 批量编辑（调价、打标、上下架）/ 图片生成。调价、打标、上下架走独立规则卡，不用 CSV；导入商品才要表格。改字段/SEO、标题/正文、合集、复制、归档、成本、Handle、Metafield、删除没有独立推荐行，只作为导入内部 apply。新增能力要在这里登记才会出现在首页。问候日期下一句经营结论（`DailyPulse`）是例外：有待办才给「看详情」、没数据才给「去回补」，都发诊断 prompt 留在 `/app` 对话；正常/同步中只留句子。不要再往卡头或推荐区加副标题、徽标与分组描述。改这里时 `HomeV2SsrFallback` 要同步（问候下预留脉冲行高度，占位块数量与 grid 口径需与真实首页一致，否则 hydrate 后跳变）。
- 创作页（`/app/create`）是「能力目录 + 页内工作区」骨架，能力只在 `app/lib/createCapabilities.ts` 登记一次，目录与工作区都从注册表派生，不要在页面里硬编码工具列表。每条能力的 `kind` 决定交互契约：`read` 直接出结果、`generate` 发起前确认且草稿落回店铺前再确认、`write` 必须走试算→审核→二次确认→应用（复用 bulk-edit 四层）、`import` 先校验再确认。`status` 决定露出方式：`ready` 有页内工作区、`chat` 闭环在助手对话（写回门禁要求 dry-run 产出的 `pending_review`）、`planned` 只做路线图占位且**目录不渲染**，别把没做完的入口摆给商户。消耗 Credit 或写店铺数据的操作统一用 `CreateConfirmDialog`，执行前预估只放弹窗、不在配置页常驻。域（domain）已按《Spark-商家常见操作》铺好，未落地的域不渲染但保留归属；整店翻译归 TSF，刻意不设该域。
- 优先复用 `DestinationPage`、`SegmentedPageTabs`、`DialogShell` 和 `pagePrimitives.module.css` 等共享页面原语。
- 所有任务列表 Card 必须以 `app/routes/component/aiTask/AITaskCardShell.tsx` 为基础。Shell 负责容器、header、状态、进度、动作区和日志挂载；业务 Card 负责文案、进度计算、actions 与业务状态。
- **prod 导航的任务页是 `/app/tasks-v2`，但 `pending_review` 仍必须能在对话内闭环**：`TaskProposalCard` 确认 → `TaskRunChatCard` 轮询 `/api/ai-task` → 进度卡「去审核」在 `ChatPanel` 的 `DialogShell` 里开审核详情，不要默认把人赶走任务页。能否走对话内审核由 `app/routes/component/chat/chatInlineReviewTasks.ts` 的白名单决定（当前 `product_improve` / `picture_translate` / `image_generation` / `bulk_price_edit` / `bulk_tag_edit` / `bulk_status_edit` / `product_export` / `product_import`）。新增需要审核的任务类型时，白名单、`ChatPanel` 的渲染分支、以及一个签名为 `{ task, onBack, showBackButton?, onTaskUpdated? }` 的 `XxxTaskDetailPage` 三者要一起加；详情组件保持纯 props、不依赖任务页 loader，这样任务页弹窗与对话弹窗能共用同一份 UI。
- `TaskProposalField` 里的 `collection`、`location` 与 `metafieldDefinition` 属于**远端资源字段**（`isResourceOptionField` 判定）：选项由 Skill 开卡时预取，卡片渲染成带关键词筛选的下拉，未选中就不允许提交。展示层一律用 `field.options` 里的 label 换成人看得懂的名称（`formatTaskProposalParamSummary` 与 `buildTaskRunPayload` 都已处理），不要把裸值丢进 i18n 查表或直接显示给商户。前两者的值是 GID，`metafieldDefinition` 的值是 `namespace.key`（definition GID 那条路已 deprecated）。以后接其它资源选择器沿用这个类型分支，不要每加一个资源就复制一套 UI。`file` 是卡片内本地上传（value 为 fileId，导入走 `/api/upload-file`）；`multiselect` 的 value 是逗号分隔。导入商品的 `operations` 决定试算走哪些已有 apply 模块，未选中不允许提交。
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

Admin 是独立项目（独立 `package.json` 与构建），不能假设根目录命令会检查它。**改 `admin/` 下任何文件前先读 `admin/AGENTS.md`**，那里有路由族、鉴权身份与各页面的口径约束。

```powershell
cd admin
npm run dev       # Express 3099 + Vite 5174
npm run build     # Vite client + tsc server
```

- 入口：`admin/server/index.ts` + `admin/server/routes/`（API）、`admin/src/App.tsx` + `admin/src/pages/`（前端）、`admin/server/lib/`（外部存储）。
- 鉴权在 `admin/server/middleware/auth.ts`；owner-only 路由用 `requireOwner`。
- Admin 没有测试框架；改动后必须在 `admin/` 跑 `npm run build`。修改共享 Prisma schema 时，主应用和 Admin 的类型/构建都要考虑。
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
- 运维/交付 npm 脚本：`npm run deploy:test`（Render 测试环境）、`npm run push:pr`（按 diff 写中文标题/摘要后提交 + push + 建/改 PR）、`npm run rebase:pr`（压成一条中文 commit + 改 PR + 强推）、`npm run orders:create`（生成测试订单）、`npm run turso:migrate:test|prod`。完整清单以 `package.json` scripts 为准。
- 主应用服务端运行需要 Shopify 和 Turso 相关变量；AI、Cosmos、Blob、Redis、SES、飞书等能力按功能依赖相应变量。
- 单元测试位于 `tests/`（Vitest）。
- 不读取或输出 `.env` / `.env.prod` 的值。只记录所需变量名。
- 诊断脚本默认叠 `.env.test` → `.env`（`scripts/lib/loadEnv.mjs`）；查产需显式 `--env=.env.prod`。交互约定见 `.cursor/rules/env-prod-safety.mdc`。

### 脚本清单（`scripts/`）

有 npm 入口的以 `package.json` scripts 为准，这里只记两条门禁：`scripts/turso-hard-reset.mjs` 会硬删 Turso 全部用户表（默认测环境，产库须 `--env=.env.prod --confirm-prod`）；`cursor-push-pr.mjs` / `cursor-rebase-pr.mjs` 传中文标题摘要要用 `--message-file` / `--body-file`，否则换行被吃掉。

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

通用 agent 行为（并行发无依赖的工具调用、避免过度设计、不给没改的代码补注释）不在这里重复。本仓库特有的两条：

- **UI 交互/布局改动先出第 7 节的交互样例，等用户看过再写产品代码**，不要直接改页面。其余场景选定方案就执行到底，除非遇到与判断直接矛盾的新信息。
- 不推测没打开过的代码。用户引用了具体文件就先读再答；对调用链、schema、组件行为下结论前先查，查不到就明确标成假设，不编造路径或 API。

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

本文件是常驻注入的，每一轮对话都付这份 token，所以**只放全局边界与「在哪里找」**。某一族能力的实现细则写进领域文档，再用 `.cursor/rules/*.mdc` 按路径触发加载（成例：计费 `app/server/billing/agent.md`、批量编辑 `app/server/bulkEdit.agent.md`、广告 `app/server/adsCatalog/agent.md`），子目录级的写进该目录的 `AGENTS.md`（成例：`admin/AGENTS.md`）。产品规划与缺口清单留在 `docs/ROADMAP.md`，不要合并进来。
