# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

Spark is an embedded Shopify app with 3 deployable services:
- **Main App** (root `/workspace`): React Router + Vite + Shopify CLI, port 3000
- **Admin Panel** (`/workspace/admin`): Express backend (port 3099) + Vite React frontend (port 5174)
- **Translation Worker** (`/workspace/worker`): Background job processor

### Quick Commands

| Task | Command | Notes |
|------|---------|-------|
| Lint | `npm run lint` | Pre-existing lint errors in codebase (worker, some tests) |
| Typecheck | `npm run typecheck` | Pre-existing TS errors in some files |
| Test | `npm run test` | Vitest; 7 test files require `TURSO_TEST_DATABASE_URL` |
| Build (main) | `npm run build` | React Router build (Vite) |
| Build (admin) | `cd admin && npm run build` | Vite client + tsc server |
| Dev (main) | `npm run dev` | Requires Shopify CLI auth (`shopify app dev`) |
| Dev (admin) | `cd admin && npm run dev` | No external deps needed to start |

### Database Setup (Prisma)

- Prisma client generates to `app/generated/prisma/` (custom output path).
- `npm run setup` = `prisma generate && prisma migrate deploy`. The migrate step needs `DATABASE_URL`.
- For local dev without Turso: `DATABASE_URL=file:./prisma/dev.sqlite npx prisma db push` syncs schema.
- **Migration ordering issue**: The `20260529082508_add_ai_task_remove_shop_visual_job` migration runs before `20260529142233_init` alphabetically but depends on tables from init. Use `prisma db push` for fresh local setups instead of `prisma migrate deploy`.

### External Service Dependencies

The main app **requires** these env vars at runtime (will crash without them):
- `TURSO_TEST_DATABASE_URL` + `TURSO_TEST_AUTH_TOKEN` (or PROD variants)
- `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET`

Optional services (app works partially without): Cosmos DB, Azure Blob, Redis, DeepSeek/OpenAI API.

### Running Services Locally

1. **Admin panel** starts without any external credentials:
   ```
   cd admin && npm run dev
   ```
   Backend: http://localhost:3099/health → `{"ok":true}`
   Frontend: http://localhost:5174/

2. **Main app** needs Shopify CLI auth + Turso credentials:
   ```
   npm run dev   # wraps shopify app dev
   ```
   Without Shopify CLI auth, use Vite directly for frontend-only dev:
   ```
   SHOPIFY_API_KEY=test SHOPIFY_API_SECRET=test npx vite --port 3000
   ```
   (Server-side routes will fail without Turso, but Vite HMR works)

3. **Worker**: `cd worker && npm run dev` (needs Cosmos/Redis/Blob env vars)

### Testing Notes

- Tests in `tests/` use Vitest with `~/` alias pointing to `app/`.
- Tests that import `app/db.server.ts` transitively require `TURSO_TEST_DATABASE_URL` (a real Turso URL). These tests will fail in environments without the secret configured.
- Pure unit tests (postprocess, formatting, utility) pass without any env vars.
- After code changes: `npm run lint && npm run typecheck && npm run test && npm run build`
- Admin has no test framework; verify with `cd admin && npm run build`.

---

## Spark 项目 Agent 上下文指南

本文档是 AI Agent 在对话中需要的完整项目上下文。包含代码结构、业务流程、快速定位、改动指南等。

**关键约定**：改代码前必先读对应的 `docs/` 文档（translation、generateDescription、billing 等）。改代码后必须 `npm run test && npm run build` 通过。**admin 项目改动后必须进入 `admin/` 目录运行 `npm run build` 检查编译错误**。

**新增 Skill / Tool 前必读**：[`docs/ROADMAP.md`](docs/ROADMAP.md) — 包含全部规划中的原子 Skill、优先级、实现路径和所需新增 Shopify Scope，避免重复造轮子或遗漏依赖。

---

## 项目概览

**Spark** 是一个嵌入式 Shopify 应用，核心能力：
- 🤖 **AI Assistant**：自然语言聊天、店铺数据查询、运营建议、工具调用
- 📊 **诊断报告**：7 天核心指标、健康状态评估
- 🌐 **翻译 V3**：JSON Runtime 任务创建与监控（Cosmos + Redis + Blob）
- 💰 **计费与订阅**：卫星 App 订阅制、按量购包、Credit 配额（Shopify Billing）
- 🎨 **生成商品描述**：AI 驱动的产品文案生成
- 🖼️ **图片工具**：整图翻译（火山 + Aidge）、文生图

---

## 完整目录结构

```
Spark/
├── app/                          应用核心（React Router + Node）
│   ├── routes/                   文件系统路由（页面与 API）
│   │   ├── app.tsx              应用壳、鉴权、导航
│   │   ├── app._index.tsx       首页（聊天）
│   │   ├── app.additional.tsx   诊断报告
│   │   ├── app.translation.tsx  翻译页
│   │   ├── app.generate-description.tsx  生成描述页
│   │   ├── app.billing.tsx      订阅与计费页
│   │   ├── app.image-studio.tsx 图片工具（文生图+图片翻译）
│   │   ├── api.*.ts             API 端点
│   │   ├── chat-stream.ts       聊天 SSE 流入口
│   │   ├── page/                页面级组件（ChatPage、TranslationPage 等）
│   │   ├── component/           UI 组件按域分（chat/、translation/、billing/ 等）
│   │   └── webhooks.*.tsx       Shopify Webhook（安装、订阅、卸载等）
│   │
│   ├── server/                   服务端逻辑
│   │   ├── ai/                   AI Agent 链路（LangGraph + ReAct）
│   │   │   ├── chat/            聊天链路入口（invokeChatAgent）
│   │   │   ├── graph/           LangGraph 图定义（shopChatGraph）+ 系统提示
│   │   │   ├── core/            核心执行（agentStream、fallback 等）
│   │   │   ├── tools/           AI 工具集合（Shopify 指标、生成描述等）
│   │   │   ├── skills/          技能模块（邮件、图片翻译等）
│   │   │   ├── postprocess/     回复后处理（文本抽取、表格规整、润色）
│   │   │   └── langsmith.server.ts  LangSmith 集成
│   │   │
│   │   ├── generateDescription/ 商品描述生成
│   │   │   ├── services/        生成服务（AI 调用、写回 Shopify）
│   │   │   ├── prompts/         Prompt 模板
│   │   │   └── *.server.ts      路由、HTML 转换、日志等
│   │   │
│   │   ├── translation/         翻译 V3 / JSON Runtime 流水线
│   │   │   ├── cosmosJobStore.server.ts     Cosmos 任务存储
│   │   │   ├── translateBlobStore.server.ts Azure Blob 报表/chunk
│   │   │   ├── translateRedis.server.ts     Redis 进度键
│   │   │   ├── translationPipelineCore.server.ts  核心流水线
│   │   │   └── types.ts         类型定义
│   │   │
│   │   ├── pictureTranslate/    整图翻译（火山 + Aidge）
│   │   │   ├── huoshan/         火山引擎实现
│   │   │   ├── aidge/           Aidge 实现
│   │   │   ├── pictureTranslateBlob.server.ts
│   │   │   └── pictureTranslateBillingService.server.ts
│   │   │
│   │   ├── imageGeneration/     文生图
│   │   │   └── imageGenerationBlob.server.ts
│   │   │
│   │   ├── billing/             订阅与计费（Shopify Billing GraphQL）
│   │   │   ├── activateSubscription.server.ts
│   │   │   ├── applyTokenPackPurchase.server.ts
│   │   │   ├── tokenPools.server.ts
│   │   │   ├── hasTokenQuota.server.ts
│   │   │   └── agent.md         计费详细说明（改前必读）
│   │   │
│   │   ├── email/               腾讯 SES 邮件（事务邮件）
│   │   │   ├── config/          环境变量读取
│   │   │   ├── services/        sendTemplateEmail 统一入口
│   │   │   ├── providers/       邮件提供商（Tencent）
│   │   │   ├── scenarios/       场景化邮件（安装、卸载、订阅等）
│   │   │   └── templates/       模板 ID 与数据转换
│   │   │
│   │   ├── feishu/              飞书运营通知
│   │   │   ├── feishuConfig.server.ts
│   │   │   ├── sendFeishuTextMessage.server.ts
│   │   │   └── scenarios/       卸载、订阅、购包通知
│   │   │
│   │   ├── appLifecycle/        App 安装/卸载运营副作用
│   │   │   ├── onAppInstalled.server.ts
│   │   │   └── onAppUninstalled.server.ts
│   │   │
│   │   ├── commonEventLog/      通用事件日志（安装、卸载、订阅等）
│   │   ├── tokenUsage/          Token 使用量累加
│   │   ├── agentRunLog/         Agent 运行摘要（Cosmos 写入）
│   │   ├── shopify/             Shopify GraphQL 查询
│   │   ├── productSearch/       产品搜索路由
│   │   ├── adAuthCredentialStore.server.ts  广告 OAuth 配置
│   │   ├── adsCredentialStore.server.ts     Meta 广告凭证读写
│   │   ├── logisticsCredentialStore.server.ts  物流凭证 JSON 存储
│   │   ├── chat.ts              聊天 action 处理
│   │   ├── chat-stream.server.ts 聊天 SSE 流服务
│   │   └── chatPayload.server.ts 聊天请求/响应序列化
│   │
│   ├── hooks/                    React 自定义 Hook
│   ├── lib/                      工具函数、类型定义、常量
│   ├── i18n/                     国际化配置（i18next）
│   ├── locales/                  翻译文件（en、ja、ko、zh）
│   ├── db.server.ts              Prisma Client + Turso 连接
│   ├── shopify.server.ts         Shopify Admin GraphQL 初始化
│   ├── entry.server.tsx          React Router 服务端入口
│   ├── root.tsx                  React Router 根组件
│   ├── routes.ts                 路由生成
│   ├── config/                   运行时配置（环境变量、Turso 选择等）
│   └── globals.d.ts              全局类型定义
│
├── prisma/                       ORM Schema + 迁移
│   ├── schema.prisma             Prisma 数据模型
│   ├── migrations/               迁移文件（Turso 版本追踪）
│   ├── dev.sqlite                本地开发数据库
│   ├── billing-plan-catalog-seed.sql  套餐种子数据
│   └── token-billing-rule-seed.sql    Token 计费系数种子
│
├── admin/                        管理后台（独立 Vite + TS 应用）
├── worker/                       后台任务（未来扩展点）
├── extensions/                   Shopify 应用扩展占位
├── scripts/                      工具脚本（turso-migrate 等）
├── docs/                         项目文档
├── .github/workflows/            CI/CD（Shopify + Render 部署）
├── public/                       静态资源
├── tests/                        测试文件
├── vite.config.ts                Vite 构建配置
├── vitest.config.ts              Vitest 测试配置
├── tsconfig.json                 TypeScript 配置
├── package.json                  项目依赖与脚本
└── README.md                     项目 README
```

---

## 核心路由映射

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

---

## 关键业务流程

### 聊天流程（AI Agent）
```
ChatPage (前端) → POST /chat-stream (SSE) → app/server/chat-stream.ts
  ├─ Shopify admin 鉴权
  ├─ 注入工具（Shopify 指标、翻译表单、生成描述等）
  └─ invokeChatAgent() → LangGraph ReAct 执行
    ├─ shopChatGraph 按系统提示执行
    ├─ 工具调用（Shopify GraphQL、生成描述、翻译等）
    ├─ 抽取 AIMessage 文本
    └─ 后处理（表格规整、润色）→ 客户端
```

### 商品描述生成流程
```
生成描述页或 AI 工具 → generateDescriptionService.ts
  ├─ AI 客户端调用（DeepSeek / OpenAI）
  ├─ Prompt 模板 + 商品上下文
  └─ 结构化 JSON → 前端编辑或直写 Shopify
```

### 翻译 V3 / JSON Runtime 流程
```
翻译页 → 创建任务 → app/server/translation/translationPipelineCore.server.ts
  ├─ 写入 Azure Cosmos（job 元数据）
  ├─ 上传内容到 Azure Blob（chunk）
  ├─ 写入 Redis 进度键
  └─ 返回任务 ID
  ↓
查看任务 → GET /api/translate/v3/json-runtime-tasks（Cosmos）
        或 GET /api/translate/v3/json-runtime-task-detail（Cosmos+Redis+Blob 聚合或转发 AgentTask）
```

### 图片翻译流程（双引擎）
```
AI 工具 picture_translate 或 /api/picture-translate
  ├─ 语言范围判断（火山 vs Aidge）
  ├─ 火山 TranslateImage API 或 Aidge IOP
  ├─ 上传结果到 Azure Blob
  ├─ 记录 token 使用（若启用计费）
  └─ 返回 SAS URL
```

### 订阅与计费流程
```
Shopify Billing GraphQL
  ├─ 订阅创建 / 续费 → Webhook app_subscriptions/update
  └─ 一次性购包 → Webhook app_purchases_one_time/update
    ↓
activateSubscription / applyTokenPackPurchase
  ├─ 计算 token 池（订阅赠送 + 购包 - 使用）
  ├─ 写入 Account 表
  └─ 记录 BillingLog + 飞书通知
    ↓
生成描述 API 校验 hasTokenQuota()
  ├─ 余额充足 → 执行，累加 usedTokens
  └─ 余额不足 → 拦截，提示续费
```

### App 安装/卸载流程
```
安装：oauth 成功 / 进入 /app
  → recordAppInstalled()
  → sendInstallOpsEmail() (可选)
  → onAppInstalled() 写入 CommonEventLog
  ↓
卸载：webhooks.app.uninstalled
  → fetchUninstallFeedbackFromPartner() (可选)
  → sendUninstallOpsEmail() → sendUninstallFeishuNotify()
  → handleAppUninstalled() 删 Session、记日志
```

---

## 数据存储详解

| 数据 | 存储 | 环境变量 | 备注 |
|------|------|---------|------|
| Session、Account、订阅、建议、广告凭证、计费日志 | Turso (libSQL) | `TURSO_*` | Prisma Client via libSQL adapter |
| 翻译任务元数据、Agent 运行摘要 | Azure Cosmos DB | `COSMOS_*` | 容器：`translation_jobs`、`agent_runs` |
| 翻译报表/chunk、图片翻译结果、生成图片 | Azure Blob Storage | `BLOB_TRANSLATE_V3_*`、`AZURE_BLOB_*` | 容器：`translation-content`、`picturetranslate`、`generatedimages` |
| 翻译进度键、监控指标 | Redis | `REDIS_*` | ioredis 客户端 |
| 物流承运商凭证 | 本地 JSON | `.data/logistics-provider-credentials.json` | 不加密，建议 KMS |

---

## AI 工具列表

在 `app/server/ai/skills/index.ts` 中注册，由 `buildChatAgentExtraTools` 注入聊天：

- `get_current_time` - 获取当前时间
- `get_weather` - 获取天气
- `get_shop_info` - Shopify 店铺信息（名称、域名、币种、时区、套餐等）
- `get_shop_kpis` - 经营指标（销售额、订单数、转化率、AOV、来源表现、弃购率、退款率、库存健康）
- `generate_product_description` - 商品描述生成（按商品 ID，生成结构化 description）
- `picture_translate` - 整图翻译
- `send_template_email` - 模板邮件发送（白名单校验）
- 翻译表单工具（通过 `translationTaskFormExtract` 推断）

**部分指标依赖权限**（如 `read_orders`），工具内置缺权限诊断文案。

---

## 计费系统核心

- **启用应用**：`BILLING_ENABLED_APPS` 仅含 `generate-description`；主 App `chat` 不扣 token
- **网关**：`BILLING_GATEWAY=noop` 时本地生效（开发）；否则走 Shopify Billing GraphQL
- **Token 池**：`Account.tokenPools` = 订阅赠送 + 购包 - usedTokens
- **校验**：`hasTokenQuota(account)` 判断余额，生成描述 API 调用前校验
- **累加**：`recordBilledTokenUsage()` / `recordVisualToolTokenUsage()` 记录使用
- **Webhook**：`app_subscriptions/update`、`app_purchases_one_time/update` 触发 `activateSubscription` / `applyTokenPackPurchase`
- **表与流水**：见 `app/server/billing/agent.md`（续费顺序、BillingLog / CommonEventLog 事件类型、Turso 迁移）

---

## 翻译系统核心

- **创建任务**：`translationPipelineCore` 写入 Cosmos、Blob、Redis
- **查看任务**：
  - `GET /api/translate/v3/json-runtime-tasks` → Cosmos 查询
  - `GET /api/translate/v3/json-runtime-task-detail` → Cosmos + Redis + Blob 聚合 或 转发 AgentTask
- **环境变量**：`COSMOS_*`、`REDIS_*`、`BLOB_TRANSLATE_V3_*`、`JSON_RUNTIME_TASK_DETAIL_SOURCE`（local 或转发）

---

## 改动快速索引

| 需求 | 文件 | 备注 |
|------|------|------|
| 改聊天、工具、AI 行为 | `app/server/chat-stream.ts`、`app/server/ai/**` | LangGraph 图见 `shopChatGraph.server.ts` |
| 改商品描述生成 | `app/server/generateDescription/**` 先读 `docs/generateDescription.md` | **改前读文档** |
| 改翻译流程 | `app/server/translation/**` 先读 `docs/translation-agent.md` | **改前读文档** |
| 改图片翻译 | `app/server/pictureTranslate/**`、`app/routes/api.picture-translate.ts` | 火山 vs Aidge 路由 |
| 改订阅计费 | `app/server/billing/**` 先读 `app/server/billing/agent.md` | **改前读文档** |
| 改邮件、App 生命周期 | `app/server/email/**`、`app/server/appLifecycle/**` | 业务只调 `sendTemplateEmail` |
| 改飞书通知 | `app/server/feishu/**` | 卸载、订阅、购包场景 |
| 改诊断报告 | `app/routes/app.additional.tsx` | 包括查询、阈值、文案 |
| 改 AI 回复处理 | `app/server/ai/postprocess/*.ts` | 附带单测 |
| 加新 AI 工具 | `app/server/ai/skills/index.ts` 或 `tools/implementations/*` | `buildChatAgentExtraTools` 注入 |
| 改聊天 UI | `app/routes/page/ChatPage.tsx`、`app/routes/component/chat/*` | 包括凭证弹层 |
| 改翻译 UI | `app/routes/page/TranslationPage.tsx`、`app/routes/component/translation/*` | — |
| 改计费页 UI | `app/routes/app.billing.tsx`、`app/routes/page/BillingPage.tsx` | — |
| 改数据库模型 | `prisma/schema.prisma` → `npm run turso:migrate:*` | — |
| 改广告 OAuth 配置 | `app/routes/app.ads.*.config.tsx`、`app/server/adAuthCredentialStore.server.ts` | — |
| 改物流凭证 | `app/routes/app.logistics.*.config.tsx`、`app/server/logisticsCredentialStore.server.ts` | — |
| **[admin]** 改 Todo 功能 | `admin/server/routes/todos.ts`、`admin/src/pages/Todo.tsx`、`admin/src/api.ts` | 改后需 `cd admin && npm run build` 验证 |

---

## 必读文档导航

| 文档 | 路径 | 何时阅读 |
|------|------|---------|
| **项目架构与约定** | `docs/PROJECT_CONTEXT.md` | 改代码前（环保变量、路由、改动落点等） |
| **翻译功能设计** | `docs/translation-agent.md` | 改翻译流程前 |
| **生成描述方案** | `docs/generateDescription.md` | 改生成描述前 |
| **计费系统详解** | `app/server/billing/agent.md` | 改订阅/计费/购包前 |
| **Agent 运行摘要** | `docs/agent-run-log.md` | 改 Agent 日志记录前 |
| **工具交互规范** | `docs/INTERACTION_DESIGN.md` | 改 tools 页面流程与任务交互前 |
| **设计系统规范** | `docs/DESIGN.md` | 改前端组件前 |

---

## 开发命令速查

```bash
# 本地开发
npm run dev                    # Shopify CLI + React Router 热刷新

# 构建与启动
npm run build                  # 生产构建
npm run start                  # 启动 React Router 服务

# 代码质量（改代码后必须运行）
npm run lint                   # ESLint 检查
npm run typecheck              # TypeScript 类型检查
npm run test                   # Vitest 单测
npm run test:watch             # 监听模式

# 数据库
npm run setup                  # Prisma generate + 本地迁移
npm run prisma:studio          # Prisma Studio
npm run turso:migrate:test     # Turso 迁移（测试库）
npm run turso:migrate:prod     # Turso 迁移（生产库）

# 其他
npm run deploy                 # Shopify 应用部署
npm run render:digest          # 生成日报
```

---

## 快速诊断

**聊天不工作**
1. 检查 `app/server/chat-stream.ts` 是否正确调用 `invokeChatAgent()`
2. 检查 `app/server/ai/graph/shopChatGraph.server.ts` 中的 LangGraph 图
3. 检查 Shopify admin 鉴权是否成功（`authenticate.admin(request)`）
4. 查看浏览器控制台与服务器日志

**工具不工作**
1. 确认工具是否在 `app/server/ai/skills/index.ts` 中注册
2. 检查工具实现是否抛出异常
3. 查看 LangSmith 链接（若 `LANGSMITH_API_KEY` 已配置）

**翻译不工作**
1. 检查 `COSMOS_*`、`REDIS_*`、`BLOB_*` 环境变量是否正确
2. 查看 `app/server/translation/translationPipelineCore.server.ts` 逻辑
3. 检查 Cosmos 任务元数据是否已写入
4. 查看 Redis 进度键是否更新

**计费不工作**
1. 检查 `BILLING_GATEWAY` 是否为 `noop`（开发）或 Shopify
2. 查看 `BILLING_ENABLED_APPS` 是否包含对应 App
3. 检查 Shopify Billing GraphQL 权限配置
4. 查看 `hasTokenQuota()` 返回值

---

## 改动前检查清单

- ✅ 改代码前，读对应的 `docs/` 文档（如有）
- ✅ 只改需求相关文件，避免无关重构
- ✅ 改后运行：`npm run lint && npm run typecheck && npm run test`
- ✅ **改后必须 `npm run build && npm run test` 通过**
- ✅ **若改 admin 项目，进入 `admin/` 目录运行 `npm run build` 验证编译（无测试框架）**
- ✅ 推送前再次检查文案一致性、鉴权流程、API 返回结构

---

*最后更新：2026-05-30*
*本文档由 Agent 在每次对话时自动加载，用于快速定位文件、理解项目结构、改进代码改动准确性*
