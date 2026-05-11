# Spark 项目说明文档

本文档描述 **Spark 与本模板分叉部分的架构与约定**（路由、持久化、翻译、环境变量）。Shopify 通用脚手架说明仍可参考仓库根目录 `README.md`；二者冲突时以本仓库 **代码** 为准，并应回头更新本文档。

## 1. 项目定位
- 这是一个嵌入式 Shopify App，核心能力是 `AI Assistant + 店铺运维诊断 + 翻译任务（V3 / JSON Runtime）`。
- 当前主要用户入口：
  - `AI Assistant`：自然语言问答、店铺数据查询、运营建议、授权引导。
  - `诊断报告`：最近 7 天核心指标、健康状态与结论建议。
  - `翻译`：在嵌入式应用中创建翻译任务（写入 Cosmos）、查看 JSON Runtime 任务列表与详情（Cosmos / Redis / Blob；详情可走 AgentTask 代理或 Spark 本机聚合）。

## 2. 技术栈与运行形态
- 前端：React + TypeScript + React Router（文件系统路由）。
- UI：Shopify Web Components（`s-*` 标签）+ App Bridge。
- 服务端：React Router action/loader + Shopify Admin GraphQL。
- AI：LangChain + ChatOpenAI 兼容接口（默认可走 DeepSeek Base URL）。
- 持久化与服务依赖（与代码一致）：
  - **Shopify Session、用户建议、广告 OAuth 配置**：同一 Prisma Client，运行时通过 `@prisma/adapter-libsql` 连接 **Turso（libSQL）**（见 `app/db.server.ts`）。`prisma/schema.prisma` 中 datasource 仍为 `sqlite` + `DATABASE_URL`，用于迁移与类型生成；线上/测试库 URL 与 Token 由 `TURSO_*` 环境变量提供。
  - **翻译任务元数据**：**Azure Cosmos DB**（容器默认 `translation` / `translation_jobs`，与 Spring 后端文档模型对齐，见 `app/server/translation/cosmosJobStore.server.ts`）。
  - **翻译 V3 报表 / chunk 等 Blob**：**Azure Blob Storage**（见 `app/server/translation/translateBlobStore.server.ts`）。
  - **翻译进度与监控键**：**Redis**（`ioredis`，见 `app/server/translation/translateRedis.server.ts`）。
  - **物流承运商授权**：本地 JSON `.data/logistics-provider-credentials.json`（见 `app/server/logisticsCredentialStore.server.ts`）。

## 3. 目录结构（迁移后，根目录即应用目录）
- `app/routes/`：页面路由与 API action/loader。
- `app/routes/page/`：聊天页、翻译页等页面级组件。
- `app/routes/component/`：聊天消息与输入、翻译监控等组件。
- `app/server/`：AI Agent、工具、授权凭证存储、`translation/` 流水线与外部存储客户端。
- `prisma/`：数据库 schema 与迁移文件。
- `.github/workflows/`：CI/CD（Shopify deploy + Render deploy）。
- `.cursor/rules/`：Cursor 规则（包括本项目上下文规则）。

## 4. 核心路由地图
- 页面路由：
  - `app/routes/app.tsx`：应用壳、导航、鉴权入口。
  - `app/routes/app._index.tsx`：默认页，渲染 `ChatPage`。
  - `app/routes/app.additional.tsx`：诊断报告页。
  - `app/routes/app.translation.tsx`：翻译入口页（嵌入 `TranslationPage`）。
- AI 聊天路由：
  - `app/routes/chat.ts` -> 转发到 `app/server/chat.ts` 的 action。
- 授权配置路由（均需 `authenticate.admin`）：
  - 广告：`app.ads.google.config.tsx` / `app.ads.tiktok.config.tsx` / `app.ads.microsoft.config.tsx` / `app.ads.meta.config.tsx` / `app.ads.meta.start.tsx`；OAuth 回调 `ads.meta.callback.tsx`。
  - 物流：`app.logistics.sf.config.tsx` / `app.logistics.fedex.config.tsx`
- 反馈路由：
  - `app.feedback.suggestion.tsx`：`POST` 校验后 **`prisma.suggestion.create`** 写入 Turso（字段 `shop`、`content`，最多 2000 字）；前端从 `ChatPage` 提交至 `/app/feedback/suggestion`。
- 翻译相关 HTTP 路由（文件位于 `app/routes/`，URL 与 React Router 扁平路由约定一致）：
  - **`GET /api/translate/v3/json-runtime-tasks`**：`api.translate.v3.json-runtime-tasks.ts`，当前店铺 JSON Runtime 任务列表（Cosmos）。
  - **`GET /api/translate/v3/json-runtime-task-detail`**：`api.translate.v3.json-runtime-task-detail.ts`，任务详情；默认转发 **`AGENT_TASK_BASE_URL`** 下的 Java `/translate/v3/jsonRuntimeTaskDetail`；若设置 **`JSON_RUNTIME_TASK_DETAIL_SOURCE=local`**，则在 Spark 进程内聚合 Cosmos / Redis / Blob（见该文件与 `jsonRuntimeTaskDetail.server.ts`）。
- 翻译服务端约定与边界： **`app/server/translation/agent.md`**（改动翻译功能前先读）。

## 5. AI 聊天链路（端到端）
- 前端 `ChatPage` 调用 `POST /chat`，请求体 `{ message }`。
- 服务端 `app/server/chat.ts`：
  - 先做 Shopify admin 鉴权。
  - 创建与店铺上下文绑定的 Shopify 工具集。
  - 调用 `invokeChatAgent()` 获取回复。
- `app/server/ai/agent.ts`：`invokeChatAgent`、Agent 构建与模型实例化；系统提示词强制简体中文、鼓励结构化输出、避免 Markdown 表格；若无可用 AIMessage 文本则走 fallback 模型。
- **回复后处理**（已从 `agent.ts` 拆出，便于单测与单独演进）：
  - `app/server/ai/langchainMessageText.ts`：从 LangChain `BaseMessage` 抽取纯文本；拼接对话上下文供兜底（`extractMessagesContext`，最长 4000 字符）。
  - `app/server/ai/markdownTableNormalize.ts`：识别 Markdown 表格、转为列表（粗体首列 + 「列名：值」）。
  - `app/server/ai/polishFinalReply.ts`：在表格规整基础上做最终润色（代码围栏保护、已有标题/列表则跳过重排、多行「指标：值」格式化为小节等）。
- **配套测试**：`app/server/ai/*.test.ts`（Vitest）；改动上述模块后建议执行 `npm run test -- --run app/server/ai`。

## 6. AI 工具能力概览
- 基础工具：
  - `get_current_time`
  - `get_weather`
- Shopify 工具（按需注入）：
  - 商店基础信息：店铺名、域名、币种、时区、套餐等。
  - scopes 查询与订单访问诊断。
  - 经营指标：销售额、订单数、转化率、AOV、来源表现、弃购率、退款率、库存健康。
- 说明：部分指标依赖权限（如 `read_orders`），工具内置了缺权限诊断文案。

## 7. 诊断报告页口径（`app.additional.tsx`）
- 时间窗口：默认最近 7 天，对比前 7 天。
- 指标来源：Shopify Admin GraphQL（orders / abandonedCheckouts / productVariants）。
- 输出内容：
  - 核心看板：销售额、订单、AOV、转化、退款、低库存率、缺货率。
  - 健康状态：销售趋势、转化健康、库存健康、退款健康。
  - 系统结论：根据阈值输出“健康/关注/风险”与诊断文案。

## 8. 广告与物流授权数据
- **广告（Google / TikTok / Microsoft / Meta OAuth 配置）**：写入 Prisma 模型 **`AdPlatformCredential`**（按 `shop` + `platform` 唯一，`credentials` 为 Json），入口见 `app/server/adAuthCredentialStore.server.ts` 与各 `app.ads.*.config.tsx`。Meta 专用读写封装见 `app/server/adsCredentialStore.server.ts`。
- **物流**：`.data/logistics-provider-credentials.json`，组织方式 `shop -> provider -> credential`（`app/server/logisticsCredentialStore.server.ts`）。
- 现状：
  - 广告凭证已在 DB 中托管（Turso）；字段校验与脱敏展示仍应注意。
  - 物流仍为本地 JSON；未做加密存储、KMS。
- 安全建议：
  - 敏感字段生产环境优先 KMS / 字段级加密；`.data` 目录禁止提交到仓库。

## 9. 运行与部署
- 常用命令（根目录执行）：
  - `npm run dev`：本地开发（Shopify CLI）。
  - `npm run build` / `npm run start`：构建与启动。
  - `npm run lint` / `npm run typecheck` / `npm run test`：质量检查与测试。
- CI 工作流：`.github/workflows/spark-deploy-test.yml`
  - 先执行 Shopify deploy（`shopify.app.test.toml`）。
  - 再触发 Render 指定 commit 部署。

## 10. 环境变量（代码中实际依赖）
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
  - `TURSO_TARGET`：`test` | `prod`（可选；未设时生产默认为 `prod`，否则 `test`）
  - 测试库：`TURSO_TEST_DATABASE_URL`、`TURSO_TEST_AUTH_TOKEN`
  - 生产库：`TURSO_PROD_DATABASE_URL`、`TURSO_PROD_AUTH_TOKEN`
  - `DATABASE_URL`：`schema.prisma` / 迁移用（本地 SQLite 等）
- 翻译 Cosmos（`cosmosJobStore.server.ts`）：
  - `COSMOS_ENDPOINT`、`COSMOS_KEY`
  - `COSMOS_TRANSLATION_DATABASE_ID`（可选，默认 `translation`）
  - `COSMOS_TRANSLATION_JOBS_CONTAINER`（可选，默认 `translation_jobs`）
- 翻译 Blob（`translateBlobStore.server.ts`）：
  - `BLOB_TRANSLATE_V3_CONNECTION_STRING` 或 `AZURE_BLOB_CONNECTION_STRING`
  - `BLOB_TRANSLATE_V3_CONTAINER` 或 `AZURE_BLOB_TRANSLATION_CONTAINER`（可选，默认 `translate-v3`）
- 翻译 Redis（`translateRedis.server.ts`）：
  - `REDIS_URL`，或 `REDIS_HOSTNAME`（或 `REDIS_HOST`）+ `REDIS_PASSWORD`（或 `REDIS_CACHEKEY_VAULT`）；可选 `REDIS_PORT`（默认 `6380`）、`REDIS_TLS`
- 翻译详情代理：
  - `AGENT_TASK_BASE_URL`（可选；未设时使用代码内默认 Render 基址）
  - `JSON_RUNTIME_TASK_DETAIL_SOURCE`：设为 `local` 时详情由 Spark 本机聚合，否则走 AgentTask

## 11. 文案与交互约定
- 角色命名统一使用：`AI Assistant`。
- 中文文案优先，保持简洁与可执行。
- 欢迎语、诊断文案、按钮文案要全局一致。
- 涉及指标输出时，优先列表与短段落，避免大段堆叠。

## 12. 改动落点指南（按需求类型）
- 改欢迎语/聊天 UI：`app/routes/page/ChatPage.tsx`、`app/routes/component/ChatMessages.tsx`。
- 改聊天行为/工具调用：`app/server/chat.ts`、`app/server/ai/agent.ts`。
- 改 AI 回复抽取、Markdown 表格规整或最终润色：`app/server/ai/langchainMessageText.ts`、`markdownTableNormalize.ts`、`polishFinalReply.ts`（单测同目录 `*.test.ts`）。
- 加新 AI 工具：`app/server/ai/tool/*`，并在 `shopifyShopInfoTool.ts` 或工具聚合处注册。
- 改诊断指标：`app/routes/app.additional.tsx`（含查询、阈值、文案）。
- 改广告 OAuth 配置字段：`app/routes/app.ads.*.config.tsx` + `app/server/adAuthCredentialStore.server.ts`（及 Meta 的 `adsCredentialStore.server.ts`）；改物流：`app/routes/app.logistics.*.config.tsx` + `app/server/logisticsCredentialStore.server.ts`。
- 改翻译创建/流水线/Cosmos 文档：`app/server/translation/*`（先读 `agent.md`）；改翻译 UI：`app/routes/page/TranslationPage.tsx`、`app/routes/component/TranslationMonitorCard.tsx`、`JsonRuntimeTaskStatusPanel.tsx`；改 API：`app/routes/api.translate.v3.*.ts`。

## 13. 改动边界与风险提示
- 未明确要求时，不改以下区域：
  - Shopify 鉴权与 session 逻辑（`app/shopify.server.ts`、`app/db.server.ts`）。
  - 部署流水线与环境配置（workflow 与 `shopify.app.*.toml`）。
  - 密钥与凭证处理逻辑。
- 涉及路由或目录重构时，必须同步检查：
  - CI 路径
  - Shopify CLI 配置路径
  - 代码中硬编码路径（`process.cwd()` 相关）

## 14. 开发检查清单
- 改前：
  - 明确影响范围（聊天/诊断/授权/部署）。
  - 只改需求相关文件，避免无关重构。
- 改后：
  - 至少执行 `npm run lint` 与关键页面回归检查。
  - 确认文案一致性、鉴权流程可用、接口返回结构未破坏。
