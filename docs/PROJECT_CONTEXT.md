# Spark 项目说明文档

本文档描述 **Spark 与本模板分叉部分的架构与约定**（路由、持久化、翻译、环境变量）。路径：`docs/PROJECT_CONTEXT.md`。Shopify 通用脚手架说明仍可参考仓库根目录 `README.md`；二者冲突时以本仓库 **代码** 为准，并应回头更新本文档。

相关文档（均在 `docs/`）：
- `translation-agent.md` — 翻译功能约定
- `generateDescription.md` — 商品描述生成方案
- `shop-insight-agent-roadmap.md` — 店铺洞察 Agent 数据/工具路线图（商业建议能力演进）
- `shop-profile.md` — 店铺画像（Cosmos + Blob，安装时 Shopify 基础信息）
- `UI_DESIGN.md` — 前端展示层 UI 规范
- `agent-run-log.md` — Agent 运行摘要（Cosmos `spark_ops`）与 LangSmith 互链
- `render-daily-digest.md` — Render 日志日报（GitHub Actions → 飞书）

## 1. 项目定位
- 这是一个嵌入式 Shopify App，核心能力是 `AI Assistant + 店铺运维诊断 + 翻译任务（V3 / JSON Runtime）+ 卫星 App 订阅计费（generate-description）`。
- 当前主要用户入口：
  - `AI Assistant`：自然语言问答、店铺数据查询、运营建议、授权引导。
  - `诊断报告`：最近 7 天核心指标、健康状态与结论建议。
  - `翻译`：在嵌入式应用中创建翻译任务（写入 Cosmos）、查看 JSON Runtime 任务列表与详情（Cosmos / Redis / Blob；详情可走 AgentTask 代理或 Spark 本机聚合）。
  - **计费与订阅**（卫星 App `generate-description`）：`/app/billing` 开通月/年订阅、按量购包、查看 token 配额；生成描述 API 在余额不足时拦截。

## 2. 技术栈与运行形态
- 前端：React + TypeScript + React Router（文件系统路由）。
- UI：Shopify Web Components（`s-*` 标签）+ App Bridge。
- 服务端：React Router action/loader + Shopify Admin GraphQL。
- AI：LangGraph（`@langchain/langgraph/prebuilt` 的 ReAct Agent）+ `@langchain/openai` 兼容 DeepSeek Base URL；消息与工具类型仍基于 `@langchain/core`。
- 持久化与服务依赖（与代码一致）：
  - **Shopify Session、用户建议、广告 OAuth 配置、计费账户**：同一 Prisma Client，运行时通过 `@prisma/adapter-libsql` 连接 **Turso（libSQL）**（见 `app/db.server.ts`）。计费相关模型：`Account`、`AppSubscription`、`PlanCatalog`、`AccountPeriodUsage`、`BillingLog`（见 `prisma/schema.prisma`；套餐种子 `prisma/billing-plan-catalog-seed.sql`）。`prisma/schema.prisma` 中 datasource 仍为 `sqlite` + `DATABASE_URL`，用于迁移与类型生成；线上/测试库 URL 与 Token 由 `TURSO_*` 环境变量提供。
  - **翻译任务元数据**：**Azure Cosmos DB**（容器默认 `translation` / `translation_jobs`，与 Spring 后端文档模型对齐，见 `app/server/translation/cosmosJobStore.server.ts`）。
  - **翻译 V3 报表 / chunk 等 Blob**：**Azure Blob Storage**（见 `app/server/translation/translateBlobStore.server.ts`）。
  - **翻译进度与监控键**：**Redis**（`ioredis`，见 `app/server/translation/translateRedis.server.ts`）。
  - **物流承运商授权**：本地 JSON `.data/logistics-provider-credentials.json`（见 `app/server/logisticsCredentialStore.server.ts`）。
  - **事务邮件（腾讯 SES 模板）**：`app/server/email/`（Provider 模式；业务统一走 `sendTemplateEmail`）；安装/卸载运营通知由 `app/server/appLifecycle/` 直接调用（见 §10）。

## 3. 目录结构（迁移后，根目录即应用目录）
- `app/routes/`：页面路由与 API action/loader。
- `app/routes/page/`：聊天页、翻译页等页面级组件；`chat/` 子目录为 `ChatPage` 拆分模块。
- `app/routes/component/`：按域分子目录（`chat/`、`translation/` 等）。
- `app/server/`：AI Agent、工具、授权凭证存储、`translation/` 流水线与外部存储客户端、`billing/` 订阅与按量计费、`tokenUsage/` token 用量累加、`email/` 腾讯 SES 发信、`appLifecycle/` 安装/卸载副作用。
- `prisma/`：数据库 schema 与迁移文件。
- `.github/workflows/`：CI/CD（Shopify deploy + Render deploy）。
- `.cursor/rules/`：Cursor 规则（包括本项目上下文规则）。

## 4. 核心路由地图
- 页面路由：
  - `app/routes/app.tsx`：应用壳、导航、鉴权入口。
  - `app/routes/app._index.tsx`：默认页，渲染 `ChatPage`。
  - `app/routes/app.additional.tsx`：诊断报告页。
  - `app/routes/app.translation.tsx`：翻译入口页（嵌入 `TranslationPage`）。
  - `app/routes/app.generate-description.tsx`：生成商品描述独立页（嵌入 `GenerateDescriptionPage`，路径 `/app/generate-description`）；loader 注入 `loadBillingContext`。
  - `app/routes/app.billing.tsx`：计费与订阅页（`/app/billing`，`BillingPage`）。
  - `app/routes/app.image-studio.tsx`：图片工作室（文生图 + 整图翻译 Tab，`/app/image-studio`）；旧路径 `/app/picture-translate`、`/app/generate-image` 重定向至此。
- AI 聊天路由（流式 SSE，唯一入口）：
  - `app/routes/chat-stream.ts` -> `app/server/chat-stream.ts` 的 action（`POST /chat-stream`，请求体 `{ messages }` 或兼容 `{ message }`）。
- 授权配置路由（均需 `authenticate.admin`）：
  - 广告：`app.ads.google.config.tsx` / `app.ads.tiktok.config.tsx` / `app.ads.microsoft.config.tsx` / `app.ads.meta.config.tsx` / `app.ads.meta.start.tsx`；OAuth 回调 `ads.meta.callback.tsx`。
  - 物流：`app.logistics.sf.config.tsx` / `app.logistics.fedex.config.tsx`
- 反馈路由：
  - `app.feedback.suggestion.tsx`：`POST` 校验后 **`prisma.suggestion.create`** 写入 Turso（字段 `shop`、`content`，最多 2000 字）；前端从 `ChatPage` 提交至 `/app/feedback/suggestion`。
- **生成商品描述**：`POST /api/generate-description`（`api.generate-description.ts`）与 `POST /app/generate-description`（同上页面 action），服务端逻辑见 `app/server/generateDescription/generateDescriptionHttp.server.ts`；**写回 Shopify 商品标题与描述**：`POST /api/update-product-description`（`api.update-product-description.ts`），服务端见 `app/server/generateDescription/updateProductDescriptionHttp.server.ts` 与 `services/updateProductDescriptionService.ts`。AI Assistant 通过工具 `generate_product_description`（`app/server/ai/tools/implementations/generateDescriptionTool.ts`）调用同一套 `services/generateDescriptionService.ts`。方案与契约见 **`docs/generateDescription.md`**（改动前先读）。
- **整图翻译（火山 + Aidge，对齐 Spring `POST /pcUserPic/translatePic`）**：`POST /api/picture-translate`（`api.picture-translate.ts`），服务端见 `app/server/pictureTranslate/**`。`modelType=1` 仅 Aidge、`modelType=2` 仅火山（不做交叉 fallback）。AI 聊天工具 `picture_translate` 按语言范围自动路由：**重叠范围优先火山**，仅 Aidge 支持的语言走 Aidge，均不支持则不译。在启用计费的 App（`generate-description`）上成功译图后通过 `recordVisualToolTokenUsage` 累加 `Account.usedTokens`（默认定额 `PICTURE_TRANSLATE_TOKEN_COST=2000`，对齐 Spring `APP_PIC_FEE` 量级）。
- 翻译相关 HTTP 路由（文件位于 `app/routes/`，URL 与 React Router 扁平路由约定一致）：
  - **`GET /api/translate/v3/json-runtime-tasks`**：`api.translate.v3.json-runtime-tasks.ts`，当前店铺 JSON Runtime 任务列表（Cosmos）。
  - **`GET /api/translate/v3/json-runtime-task-detail`**：`api.translate.v3.json-runtime-task-detail.ts`，任务详情；默认转发 **`AGENT_TASK_BASE_URL`** 下的 Java `/translate/v3/jsonRuntimeTaskDetail`；若设置 **`JSON_RUNTIME_TASK_DETAIL_SOURCE=local`**，则在 Spark 进程内聚合 Cosmos / Redis / Blob（见该文件与 `jsonRuntimeTaskDetail.server.ts`）。
- 翻译服务端约定与边界： **`docs/translation-agent.md`**（改动翻译功能前先读）。
- **计费 Webhook**（卫星 App toml 已注册）：
  - `app_subscriptions/update` → `webhooks.app.subscriptions_update.tsx`
  - `app_purchases_one_time/update` → `webhooks.app.purchases_one_time_update.tsx`
  - `app/uninstalled` → `webhooks.app.uninstalled.tsx`（`CommonEventLog`）
  - `app/scopes_update` → `webhooks.app.scopes_update.tsx`（`CommonEventLog`）
- 计费服务端约定与边界： **`app/server/billing/agent.md`**（改动计费/订阅/购包前先读）。

## 5. 计费与订阅（generate-description）

- **启用范围**：`BILLING_ENABLED_APPS` 仅含 `generate-description`；主 App `chat` 不校验 token。
- **网关**：`getBillingGateway()` — 生产走 Shopify Billing GraphQL；`BILLING_GATEWAY=noop` 时本地直接生效（开发）。
- **访问控制**：`requireBillingAccess` / `loadBillingContext`（`app/server/billing/`）；生成描述 HTTP 在调用前校验余额。
- **用量**：LangChain 调用经 `app/server/tokenUsage/` 累加 `usedTokens`；可用余额为 `getAvailableTokens()`（三池之和减 `usedTokens` 判断见 `hasTokenQuota`）；订阅续费时按 `tokenPools.server.ts` 结算按量包真实剩余。
- **表与流水**：见 `app/server/billing/agent.md`（续费顺序、`BillingLog` / `CommonEventLog` 事件类型、Turso 迁移命令）。
- **App 生命周期事件**（卫星 App）：`CommonEventLog` 记录安装 / 卸载 / scope 变更；卸载与 scope webhook 见 `app/server/billing/agent.md`；安装在进入 `/app` 或 OAuth 时写入。
- **与整图翻译计费区分**：`PICTURE_TRANSLATE_BILLING_*` 仅作用于 `/api/picture-translate` 的 Spring 点数对齐，与 Shopify 订阅模块无关。

## 6. AI 聊天链路（端到端）
- 前端 `ChatPage` 经 `useChatStream` 调用 `POST /chat-stream`（SSE），请求体为 `messages` 数组（兼容单条 `message`）。
- 服务端 `app/server/chat-stream.ts`：
  - 先做 Shopify admin 鉴权。
  - 通过 `buildChatAgentExtraTools(admin)` 注入 Shopify 指标工具、翻译表单工具与 **`generate_product_description`** 等。
  - 调用 `invokeChatAgent()` 获取回复。
- `app/server/ai/graph/shopChatGraph.server.ts`：`buildShopChatGraph`、`getShopChatModel`（LangGraph ReAct 编译图）；系统提示词见同目录 `shopAssistantPrompt.ts`（简体中文、鼓励结构化输出、避免 Markdown 表格）。
- `app/server/ai/core/invokeChatAgent.server.ts`：`invokeChatAgent`（图执行、表单解析、兜底模型）；若无可用 AIMessage 文本则走 fallback。
- **流式**：`app/server/ai/core/agentStream.server.ts`：`invokeChatAgentStream`（`graph.stream`，供 `/chat-stream` 等）。
- **回复后处理**（`app/server/ai/postprocess/`，便于单测与单独演进）：
  - `langchainMessageText.ts`：从 LangChain `BaseMessage` 抽取纯文本；拼接对话上下文供兜底（`extractMessagesContext`，最长 4000 字符）。
  - `markdownTableNormalize.ts`：识别 Markdown 表格、转为列表（粗体首列 + 「列名：值」）。
  - `polishFinalReply.ts`：在表格规整基础上做最终润色（代码围栏保护、已有标题/列表则跳过重排、多行「指标：值」格式化为小节等）。
  - `translationTaskFormExtract.ts`：从 ToolMessage / 对话推断翻译任务表单载荷。
- **配套测试**：`tests/app/server/ai/postprocess/*.test.ts`（Vitest）；改动上述模块后建议执行 `npm run test`。

## 7. AI 工具能力概览
- 基础工具：
  - `get_current_time`
  - `get_weather`
- Shopify 工具（按需注入）：
  - 商店基础信息：店铺名、域名、币种、时区、套餐等。
  - scopes 查询与订单访问诊断。
  - 经营指标：销售额、订单数、转化率、AOV、来源表现、弃购率、退款率、库存健康。
- 商品文案：`generate_product_description`（按商品 ID 生成结构化 `description`，见 `app/server/ai/tools/implementations/generateDescriptionTool.ts`）。
- 模板邮件：`send_template_email`（`app/server/ai/skills/email/`，凭证齐全时挂载；经 `sendTemplateEmail` 发送，模板 ID 白名单校验）。
- 说明：部分指标依赖权限（如 `read_orders`），工具内置了缺权限诊断文案。

## 8. 诊断报告页口径（`app.additional.tsx`）
- 时间窗口：默认最近 7 天，对比前 7 天。
- 指标来源：Shopify Admin GraphQL（orders / abandonedCheckouts / productVariants）。
- 输出内容：
  - 核心看板：销售额、订单、AOV、转化、退款、低库存率、缺货率。
  - 健康状态：销售趋势、转化健康、库存健康、退款健康。
  - 系统结论：根据阈值输出“健康/关注/风险”与诊断文案。

## 9. 广告与物流授权数据
- **广告（Google / TikTok / Microsoft / Meta OAuth 配置）**：写入 Prisma 模型 **`AdPlatformCredential`**（按 `shop` + `platform` 唯一，`credentials` 为 Json），入口见 `app/server/adAuthCredentialStore.server.ts` 与各 `app.ads.*.config.tsx`。Meta 专用读写封装见 `app/server/adsCredentialStore.server.ts`。
- **物流**：`.data/logistics-provider-credentials.json`，组织方式 `shop -> provider -> credential`（`app/server/logisticsCredentialStore.server.ts`）。
- 现状：
  - 广告凭证已在 DB 中托管（Turso）；字段校验与脱敏展示仍应注意。
  - 物流仍为本地 JSON；未做加密存储、KMS。
- 图片工具与商品文案 token 入账前按 Turso **`TokenBillingRule`**（能力 × 模型 × `multiplier`）折算，运维配置见 **`docs/token-billing-rules.md`**。图片工具在启用计费的 App 上 `requireVisualToolBillingAccess` 校验余额；成功后 `recordBilledTokenUsage` / `recordVisualToolTokenUsage` 累加 `usedTokens`。主 App（`chat`）未启用计费时不扣减。
- 安全建议：
  - 敏感字段生产环境优先 KMS / 字段级加密；`.data` 目录禁止提交到仓库。

## 10. 事务邮件（腾讯 SES）

Spark **不调用 Spring Backend 邮件 API**，进程内直连腾讯 SES SDK（`tencentcloud-sdk-nodejs-ses`）。模板 ID、发件人、CC 等与历史 Java 侧命名对齐，仅作常量参照。

### 目录结构（`app/server/email/`）

| 路径 | 职责 |
|------|------|
| `config/emailConfig.server.ts` | 读取 `TENCENT_*`、`EMAIL_*` 等环境变量 |
| `services/emailService.server.ts` | **`sendTemplateEmail`** 统一入口（业务勿直连 Provider） |
| `providers/providerFactory.server.ts` | 按 `EMAIL_PROVIDER` 选择实现（默认 `tencent`） |
| `providers/tencentSesProvider.server.ts` | 腾讯 `SendEmail` API + 重试 |
| `utils/retryWithTimeout.server.ts` | 超时与重试（可配置次数；HTTP 400 不重试） |
| `templates/emailTemplates.server.ts` | 模板 ID / 主题常量（`EMAIL_TEMPLATE_IDS`） |
| `templates/installOpsTemplateData.server.ts` | 安装运营邮件 `templateData` |
| `templates/uninstallOpsTemplateData.server.ts` | 卸载运营邮件 `templateData` |
| `scenarios/sendInstallOpsEmail.server.ts` | 安装运营场景（templateId `137916`） |
| `scenarios/sendUninstallOpsEmail.server.ts` | 卸载运营场景 |
| `opsNotifyEmail.server.ts` | 运营收件人、`OPS_UNINSTALL_TEMPLATE_ID` 解析 |
| `index.ts` | 对外导出 |

### App 生命周期运营邮件（`app/server/appLifecycle/`）

| 文件 | 触发 | 行为 |
|------|------|------|
| `onAppInstalled.server.ts` | `recordAppInstalled` 写入 `CommonEventLog` 成功后（OAuth `auth.$.tsx`、进入 `/app` 等） | Shopify 店铺信息 + Session 快照 → `sendInstallOpsEmail` |
| `onAppUninstalled.server.ts` | `webhooks.app.uninstalled.tsx` 鉴权后 | **先** `sendUninstallOpsEmail`，**再** `handleAppUninstalled`（写日志并删 Session） |

安装 enrichment：`unauthenticated.admin(shop)` + `fetchShopBasicInfo`。卸载 enrichment：`loadSessionSnapshotForUninstall`（不调 GraphQL）。邮件失败不阻断安装 Loader；卸载邮件失败不阻断后续持久化；持久化失败时 Webhook 仍 `throw` 以便 Shopify 重试。

### 首期接入范围

- 已实现：通用 `sendTemplateEmail`、安装/卸载运营邮件、AI 工具 `send_template_email`（`app/server/ai/skills/email/`，模板 ID 白名单）。
- 未接入：`emailTemplates.server.ts` 中其余 templateId（翻译成功/失败、购包、APG 等）按需后续在 `scenarios/` 扩展。

### 日志与排错

- 前缀：`[Email][Service]`、`[Email][Tencent]`、`[Email][InstallOps]`、`[Email][UninstallOps]`、`[AppLifecycle:install]`、`[AppLifecycle:uninstall]`。
- 缺凭证：`sendTemplateEmail` 返回 `EMAIL_MISSING_CREDENTIALS`，主流程不阻断。
- 发送失败：`TENCENT_SEND_FAILED`；成功以响应非空 `RequestId` 为准。

## 11. 运行与部署
- 常用命令（根目录执行）：
  - `npm run dev`：本地开发（Shopify CLI）。
  - `npm run build` / `npm run start`：构建与启动。
  - `npm run lint` / `npm run typecheck` / `npm run test`：质量检查与测试。
- CI 工作流：`.github/workflows/spark-deploy-test.yml`
  - 先触发 Render Test 部署（commit deploy）。
  - Shopify deploy（`shopify.app.test.toml`）仅在 `workflow_dispatch` 或 `master` push 时执行。
  - **卫星 App**（`shopify.app.smart-description.toml`，如 Desc - Test）的 Webhook 注册**不会**随上述 CI 自动更新；改 webhook 后需本地执行：`shopify app deploy -c shopify.app.smart-description.toml`。

### Turso 数据库（迁移与同步）

Prisma CLI 的 `migrate deploy` **不能**直接连 `libsql://`（`provider = sqlite` 时要求 `file:` URL）。对 Turso 请用仓库脚本，运行时仍由 `app/db.server.ts` + `TURSO_*` 连接。

| 命令 | 用途 |
|------|------|
| `npm run turso:migrate:test` / `turso:migrate:prod` | **首选**：维护 `_prisma_migrations`，只执行未应用的 `prisma/migrations/*/migration.sql`，并写入 PlanCatalog 种子 |
| `npm run turso:migrate:test -- --baseline` | 库曾仅用 `turso:sync` 建好、表已齐：只把已有 migration **标记为已应用**，不执行 SQL（**勿**对缺表库使用） |
| `npm run turso:sync:test` / `turso:sync:prod` | 空库兜底：从全部 migration 生成 `turso-baseline.sql` 并全量执行（`CREATE IF NOT EXISTS`）；**不会** ALTER 已有表，**无**版本表 |
| `prisma/token-billing-rule-seed.sql` | Token 计费系数种子（`turso:migrate` / `turso:sync` 后执行） |

推荐流程：

1. 本地改 schema → `npx prisma migrate dev`（`DATABASE_URL=file:...`）。
2. 推到 Turso 测试库 → `npm run turso:migrate:test`。
3. 生产 → `npm run turso:migrate:prod`。
4. 首次从 `turso:sync` 迁到 migrate：先 `--baseline`，之后只用 `turso:migrate`。

实现见 `scripts/turso-migrate.cjs`、`scripts/turso-sync.cjs`。

## 12. 环境变量（代码中实际依赖）
- Shopify 侧：
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SCOPES`
  - `SHOPIFY_APP_URL`
  - `SHOP_CUSTOM_DOMAIN`（可选）
- AI 模型侧：
  - `DEEPSEEK_API_KEY`（优先）或 `OPENAI_API_KEY`
  - `DEEPSEEK_MODEL` / `OPENAI_MODEL`（可选）
  - `DEEPSEEK_BASE_URL`（可选，默认 DeepSeek v1）
- Prisma / Turso（`app/db.server.ts`）：
  - `TURSO_TARGET`：`test` | `prod`（可选；未设时 `NODE_ENV=production` 默认连 **prod** 并读 `TURSO_PROD_*`；非 production 默认 test）
  - 占位 prod URL（如 `your-prod-db`）视为未配置，不会误连
  - Render Test：同为 `NODE_ENV=production`，须显式 `TURSO_TARGET=test` 或**仅**配置 `TURSO_TEST_*`（勿留占位 `TURSO_PROD_*`）
  - **Render 环境变量**：在 Web Service → **Environment** 面板添加（会注入 `process.env`）。若用 **Secret File** 上传 `.env`，需挂载到 `/etc/secrets/.env`（或设 `ENV_FILE` 指向路径）；Secret File **不会**自动进 `process.env`，启动时由 `app/config/runtimeEnv.server.ts` 读取
  - 测试库：`TURSO_TEST_DATABASE_URL`、`TURSO_TEST_AUTH_TOKEN`
  - 生产库：`TURSO_PROD_DATABASE_URL`、`TURSO_PROD_AUTH_TOKEN`
  - `DATABASE_URL`：`schema.prisma` / 迁移用（本地 SQLite 等）
- 翻译 Cosmos（`cosmosJobStore.server.ts`）：
  - `COSMOS_ENDPOINT`、`COSMOS_KEY`
  - `COSMOS_TRANSLATION_DATABASE_ID`（可选，默认 `translation`）
  - `COSMOS_TRANSLATION_JOBS_CONTAINER`（可选，默认 `translation_jobs`）
- Agent 运行摘要 Cosmos（`app/server/agentRunLog/`，见 `docs/agent-run-log.md`）：
  - 与翻译共用 `COSMOS_ENDPOINT`、`COSMOS_KEY`
  - `COSMOS_OPS_DATABASE_ID`（可选，默认 `spark_ops`）
  - `COSMOS_AGENT_RUNS_CONTAINER`（可选，默认 `agent_runs`）
  - `AGENT_RUN_LOG_ENABLED`（默认开启；`false` 关闭写入）
  - `AGENT_RUN_TIMEOUT_MS`（可选，默认 `120000`）
- 翻译 Blob（`translateBlobStore.server.ts`）：
  - `BLOB_TRANSLATE_V3_CONNECTION_STRING` 或 `AZURE_BLOB_CONNECTION_STRING`
  - `BLOB_TRANSLATE_V3_CONTAINER` 或 `AZURE_BLOB_TRANSLATION_CONTAINER`（可选，默认 `translate-v3`）
- 翻译 Redis（`translateRedis.server.ts`）：
  - `REDIS_URL`，或 `REDIS_HOSTNAME`（或 `REDIS_HOST`）+ `REDIS_PASSWORD`（或 `REDIS_CACHEKEY_VAULT`）；可选 `REDIS_PORT`（默认 `6380`）、`REDIS_TLS`
- 翻译详情代理：
  - `AGENT_TASK_BASE_URL`（可选；未设时使用代码内默认 Render 基址）
  - `JSON_RUNTIME_TASK_DETAIL_SOURCE`：设为 `local` 时详情由 Spark 本机聚合，否则走 AgentTask
- 整图翻译（火山 `TranslateImage` + Aidge IOP + Azure Blob，见 `app/server/pictureTranslate/`）：
  - 火山：`HUOSHAN_API_KEY`、`HUOSHAN_API_SECRET`；兼容 `VOLC_ACCESSKEY`、`VOLC_SECRETKEY`
  - Aidge：`AIDGE_ACCESS_KEY_ID`（或 `AIDGE_ACCESS_KEY_NAME`）、`AIDGE_ACCESS_KEY_SECRET`；`AIDGE_BASE_URL`（默认 `https://cn-api.aidc-ai.com`）；`AIDGE_IMAGE_TRANSLATE_PATH`（默认 `/ai/image/translation`）
  - 可选：`AIDGE_REQUEST_TIMEOUT_MS`（默认 `30000`）、`AIDGE_IOP_TRIAL=true`（试用请求头）、`AIDGE_PARTNER_ID`（默认 `iop`）
  - 可选：`PICTURE_TRANSLATE_IMAGE_FETCH_CONNECT_MS`、`PICTURE_TRANSLATE_IMAGE_FETCH_READ_MS`（毫秒，默认各 `5000`）
  - 可选：`PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES`、`PICTURE_TRANSLATE_BILLING_STRICT`
- 订阅计费（`app/server/billing/`）：
  - `BILLING_GATEWAY=noop`：不调 Shopify Billing，本地直接生效（开发）
  - `BILLING_TEST=true`：Shopify 测试计费（开发店）；未设时非 production 亦视为测试模式
- 腾讯 SES 邮件（`app/server/email/`，结构见 §10）：
  - `TENCENT_CLOUD_KEY_ID`、`TENCENT_CLOUD_KEY`（与 Spring 同名）
  - 可选：`EMAIL_PROVIDER`（默认 `tencent`）、`EMAIL_ENABLED`（默认 `true`）、`TENCENT_SES_REGION`（默认 `ap-hongkong`）、`TENCENT_FROM_EMAIL`、`TENCENT_SES_CC`、`EMAIL_SEND_TIMEOUT_MS`、`EMAIL_SEND_MAX_RETRIES`
  - 运营通知：`OPS_NOTIFY_EMAIL`（未设则取 `TENCENT_SES_CC` 首地址）；卸载模板 `OPS_UNINSTALL_TEMPLATE_ID`（未设则跳过卸载邮件）
  - App 安装/卸载运营邮件：安装在 `recordAppInstalled` 成功后直接调用 `onAppInstalled`；卸载 Webhook 直接调用 `onAppUninstalled`（先邮件后删 Session）

## 13. 文案与交互约定
- 角色命名统一使用：`AI Assistant`。
- 中文文案优先，保持简洁与可执行。
- 欢迎语、诊断文案、按钮文案要全局一致。
- 涉及指标输出时，优先列表与短段落，避免大段堆叠。

## 14. 改动落点指南（按需求类型）
- 改欢迎语/聊天 UI：`app/routes/page/ChatPage.tsx`、`app/routes/component/chat/*`（页面旁路与凭证弹层逻辑见 `app/routes/page/chat/`）。
- 改聊天行为/工具调用：`app/server/chat-stream.ts`、`app/server/ai/core/invokeChatAgent.server.ts`、`app/server/ai/core/agentStream.server.ts`、`app/server/ai/skills/index.ts`、`app/server/ai/core/shopChatGraph.server.ts`。
- 改 AI 回复抽取、Markdown 表格规整或最终润色：`app/server/ai/postprocess/langchainMessageText.ts`、`markdownTableNormalize.ts`、`polishFinalReply.ts`（单测同目录 `*.test.ts`）。
- 改 Agent 运行摘要 / Cosmos 写入：`app/server/agentRunLog/**`（先读 `docs/agent-run-log.md`）；聊天写入见 `invokeChatAgent.server.ts`、`agentStream.server.ts`。
- 加新 AI 工具：`app/server/ai/skills/index.ts` 的 `globalToolRegistry.register`（或 legacy `app/server/ai/tools/implementations/*`），由 `buildChatAgentExtraTools` 注入聊天链路。
- 改邮件发送 / 模板 / Provider：`app/server/email/**`（业务只调 `sendTemplateEmail` / scenario 封装，勿直接用 Provider）。
- 改 App 安装/卸载运营邮件：`app/server/appLifecycle/`、`app/server/commonEventLog/recordAppInstalled.server.ts`、`app/routes/webhooks.app.uninstalled.tsx`、`app/server/email/scenarios/sendInstallOpsEmail.server.ts`、`sendUninstallOpsEmail.server.ts`。
- 改 Agent 模板邮件工具：`app/server/ai/skills/email/**`。
- 改诊断指标：`app/routes/app.additional.tsx`（含查询、阈值、文案）。
- 改广告 OAuth 配置字段：`app/routes/app.ads.*.config.tsx` + `app/server/adAuthCredentialStore.server.ts`（及 Meta 的 `adsCredentialStore.server.ts`）；改物流：`app/routes/app.logistics.*.config.tsx` + `app/server/logisticsCredentialStore.server.ts`。
- 改生成商品描述页或 API（先读 `docs/generateDescription.md`）：`app/routes/app.generate-description.tsx`、`app/routes/page/GenerateDescriptionPage.tsx`、`app/routes/component/generateDescription/GenerateDescriptionResultEditor.tsx`、`app/routes/api.generate-description.ts`、`app/routes/api.update-product-description.ts`、`app/server/generateDescription/**`、`app/hooks/useGenerateDescription.ts`、`app/server/ai/tools/implementations/generateDescriptionTool.ts`。
- 改整图翻译 API / 双引擎路由：`app/routes/api.picture-translate.ts`、`app/server/pictureTranslate/**`、`app/server/ai/skills/pictureTranslate/**`。
- 改翻译创建/流水线/Cosmos 文档：`app/server/translation/*`（先读 `docs/translation-agent.md`）；改翻译 UI：`app/routes/page/TranslationPage.tsx`、`app/routes/component/translation/*`；改 API：`app/routes/api.translate.v3.*.ts`。
- 改订阅/购包/余额/Webhook：`app/server/billing/**`（先读 `app/server/billing/agent.md`）；改计费页 UI：`app/routes/app.billing.tsx`、`app/routes/page/BillingPage.tsx`、`app/routes/component/billing/*`、`app/lib/billingPlanUi.ts`、`app/lib/billingPageTypes.ts`；改 Webhook：`app/routes/webhooks.app.subscriptions_update.tsx`、`webhooks.app.purchases_one_time_update.tsx`、`webhooks.app.uninstalled.tsx`、`webhooks.app.scopes_update.tsx`；改 App 生命周期流水：`app/server/commonEventLog/**`；改 token 累加：`app/server/tokenUsage/**`；改套餐种子：`prisma/billing-plan-catalog-seed.sql` + `npm run turso:migrate:*`。

## 15. 改动边界与风险提示
- 未明确要求时，不改以下区域：
  - Shopify 鉴权与 session 逻辑（`app/shopify.server.ts`、`app/db.server.ts`）。
  - 部署流水线与环境配置（workflow 与 `shopify.app.*.toml`）。
  - 密钥与凭证处理逻辑。
- 涉及路由或目录重构时，必须同步检查：
  - CI 路径
  - Shopify CLI 配置路径
  - 代码中硬编码路径（`process.cwd()` 相关）

## 16. 开发检查清单
- 改前：
  - 明确影响范围（聊天/诊断/授权/部署）。
  - 只改需求相关文件，避免无关重构。
- 改后：
  - 至少执行 `npm run lint` 与关键页面回归检查。
  - 确认文案一致性、鉴权流程可用、接口返回结构未破坏。
  - **Agent 每次修改代码后，必须运行 `npm run build` 确保构建成功，并运行 `npm run test` 确保所有测试通过，以避免引入回归。**
  - **在将修改推送上线前，Agent 必须再次运行 `npm run build` 和 `npm run test`，确保代码可直接发布上线。**
