# AGENTS.md

本文件是 Codex 在 `Spark` 仓库中的强制入口和长期维护的代码导航。它适用于仓库根目录及所有子目录；若某个子目录以后新增更具体的 `AGENTS.md`，则子目录文件在其作用域内优先。

## 0. 每次任务必须先做

任何开发、排错、评审、规划、运行命令或文件定位开始前，必须：

1. 从头到尾完整读取当前 `AGENTS.md`，不能只依赖对话中附带的旧副本或历史记忆。
2. 执行 `git status --short`，识别并保护用户已有改动和未跟踪文件。
3. 根据“必读文档路由”读取与任务直接相关的文档。
4. 用 `rg` / `rg --files` 核对真实调用链和文件是否仍存在，再制定方案或修改代码。
5. 修改后按“验证矩阵”执行与风险匹配的检查，并如实报告未执行或被环境阻塞的项目。

若本文件、旧文档和当前代码冲突，优先级为：**当前代码与配置 > `package.json` / Prisma schema > 本文件 > 领域文档 > README**。发现漂移时，应在本次改动范围内同步更新本文件或对应文档。

## 1. 项目现状

Spark 是嵌入 Shopify Admin 的 AI 运营应用，当前仓库有两个可独立运行的应用和一个 Shopify 扩展：

- **主应用（仓库根目录）**：React 18、React Router 7 文件路由、Vite、Shopify App Bridge / Web Components、Node 服务端，默认由 Shopify CLI 启动。
- **Admin 后台（`admin/`）**：Express API（本地默认 `3099`）+ Vite React 前端（本地默认 `5174`）。它有独立的 `package.json`、依赖和构建流程。
- **Web Pixel 扩展（`extensions/ciwi-spark-web-pixel/`）**：采集 Shopify analytics/custom events，经主应用 `/api/pixel-ingest` 上报。

重要边界：

- 当前仓库**没有 `worker/` 目录或 Translation Worker 可部署服务**。
- 整店/多语言翻译任务及共享翻译核心归 TypeScriptFrontend（TSF）所有；`app/server/ai/skills/index.ts` 不再注册整店翻译工具，Spark 也不再保存翻译规则或 Worker 实现副本。
- Spark 内仍有**图片翻译**功能，以及 `app/server/translation/translateBlobStore.server.ts` 等少量兼容清理、Admin 只读观测代码。不要把图片翻译或运维读取误判为整店翻译运行时。
- 根目录存在若干 `tmp-*` 未跟踪恢复文件；除非用户明确要求，禁止删除、覆盖或纳入改动。

## 2. 仓库地图

```text
Spark/
├─ app/
│  ├─ routes/                 React Router 页面、API、Webhook；flatRoutes 自动发现
│  │  ├─ page/                页面级组合与 workspace UI
│  │  └─ component/           按业务域拆分的可复用组件
│  ├─ server/                 服务端业务、AI、存储和外部集成
│  ├─ config/                 运行时与应用入口配置
│  ├─ i18n/ + locales/        i18next 配置及中英文资源
│  ├─ generated/prisma/       Prisma 生成物，不手工编辑
│  ├─ db.server.ts            Prisma + libSQL/Turso 连接
│  ├─ shopify.server.ts       Shopify 鉴权和 Admin API 初始化
│  ├─ routes.ts               @react-router/fs-routes 入口
│  └─ root.tsx                React Router 根组件
├─ admin/                     独立 Express + Vite 管理后台
├─ extensions/                Shopify 扩展，目前为 Web Pixel
├─ prisma/                    schema、迁移和计费种子 SQL
├─ tests/                     与 app/ 大体镜像的 Vitest 测试
├─ scripts/                   运维、Turso、部署、飞书文档等脚本
├─ docs/                      架构、交互、设计、路线图和运营文档
├─ .github/workflows/         部署工作流
├─ .codex/config.toml         仓库级 Codex MCP 配置
└─ package.json               主应用命令和依赖的事实来源
```

不要手工编辑 `build/`、`.react-router/`、`coverage/`、`node_modules/`、`admin/dist/` 或 `app/generated/prisma/`。

## 3. 当前信息架构与入口

`app/routes/app.tsx` 是嵌入式应用壳和鉴权入口。一级导航由 `app/config/appEntry.server.ts` 定义，当前固定为：

| 目的地 | URL | 主要实现 |
|---|---|---|
| Ask | `/app` | `app._index.tsx` → `page/workspace/WorkspaceAppShellPage.tsx`，聊天与上下文工作台 |
| Today | `/app/today` | `app.today.*`，首页看板、诊断、订单 |
| Studio | `/app/studio` | `app.studio.*`，商品文案、图片生成、图片翻译 |
| Tasks | `/app/tasks` | `app.tasks.tsx` + `UnifiedTaskListPage` |
| Settings | `/app/settings` | `app.settings.*`，计费、渠道、物流、数据、反馈 |

关键 HTTP 入口：

- `POST /chat-stream`：`app/routes/chat-stream.ts` → `app/server/chat-stream.ts`，SSE 聊天入口。
- `/api/ai-task*`、`/api/batch-ai-tasks`、`/api/unified-tasks`：异步任务创建、状态、日志与统一列表。
- `/api/product-improve`、`/api/product-quality-score`、`/api/update-product-description`：商品内容优化链路。
- `/api/generate-image*`、`/api/picture-translate*`：图片生成和图片翻译。
- `/api/conversations*`、`/api/files*`、`/api/context-resources*`：工作台会话与上下文资源。
- `/api/automation-overview`：Today/自动化概览。
- `/api/pixel-ingest`：Web Pixel 采集入口。
- `webhooks.*.tsx`：Shopify 卸载、scope、订阅、购包、订单、退款、库存、履约 Webhook。

React Router 使用 `app/routes.ts` 中的 `flatRoutes()`；新增或改名路由时必须按文件路由规则核对最终 URL，并检查父布局/索引路由关系。

## 4. 服务端领域导航

| 需求 | 首要代码入口 |
|---|---|
| 聊天请求与 SSE | `app/server/chat-stream.ts`、`app/server/chatPayload.server.ts` |
| Agent 图、模型、提示词 | `app/server/ai/core/shopChatGraph.server.ts`、`agentStream.server.ts`、`shopAssistantPrompt.ts` |
| Skill / Tool 注册 | `app/server/ai/skills/index.ts`、`app/server/ai/core/toolRegistry.server.ts` |
| Playbook 与能力目录 | `app/server/ai/playbooks/`、`app/server/ai/core/playbookRegistry.server.ts`、`skillManifest.server.ts` |
| AI 任务执行与日志 | `app/server/aiTask/`、`app/server/ai/core/stepRunner.server.ts`、各 Skill service |
| 商品文案与质量优化 | `app/server/productImprove/` |
| 图片生成 | `app/server/imageGeneration/` |
| 图片翻译 | `app/server/pictureTranslate/` |
| 统一任务列表 | `app/server/unifiedTask/` |
| Today/运营诊断/ROI | `app/server/operations/`、`app/server/automation/` |
| Shopify 数据读取与同步 | `app/server/shopify/` |
| 计费、订阅、购包 | `app/server/billing/`、`app/server/tokenUsage/` |
| 会话与文件上下文 | `app/server/conversation/`、`app/server/fileContext/` |
| 支持聊天 | `app/server/support/` |
| 邮件与商户通知 | `app/server/email/`、`app/server/notifications/` |
| 飞书运营通知 | `app/server/feishu/` |
| App 生命周期与事件 | `app/server/appLifecycle/`、`app/server/commonEventLog/` |
| Web Pixel / 阿里云日志 | `app/server/webPixel/`、`app/server/aliyunLog/` |
| Agent 运行摘要 | `app/server/agentRunLog/` |
| Playbook Case | `app/server/playbookCase/` |

AI 主链路应从真实代码确认，通常为：工作台 `useChatStream` → `POST /chat-stream` → `app/server/chat-stream.ts` → `invokeChatAgent` / LangGraph → 全局 Tool Registry → SSE 事件回传。修改工具时同时检查注册、schema、执行器、token 计费、任务卡片和测试，不要只改工具实现文件。

## 5. 数据与外部系统边界

- **Turso / libSQL + Prisma**：业务主数据。模型在 `prisma/schema.prisma`，包括 Session、Account/订阅/计费、AITask、订单/退款/客户/库存/履约镜像、WorkspaceFile、Conversation/Message、运营诊断、成本/ROI、支持会话等。
- **Azure Cosmos DB**：Agent 运行摘要和 Playbook Case 等事件/结果型数据；入口集中在 `app/server/cosmos/`、`agentRunLog/`、`playbookCase/`。默认不应假设容器会自动创建。
- **Azure Blob Storage**：上传文件、图片生成、图片翻译及兼容翻译内容。写入前确认容器、SAS 生命周期和清理策略。
- **Redis**：Admin 运营排查和部分历史/兼容状态读取。不要未经确认把新的核心业务对象只存 Redis。
- **Aliyun SLS**：Pixel、访问与功能行为日志。
- **Shopify Admin GraphQL / Billing**：店铺数据、写回、订阅与一次性购包。
- **腾讯 SES / 飞书**：商户邮件与内部运营通知。通知失败通常不应阻断主业务，沿用现有场景封装。

存储设计默认遵守：业务对象与遥测分离；先复用现有 store/service，再考虑新增容器或表；涉及跨仓库整店翻译边界时同时核对 TSF 当前实现。

## 6. 必读文档路由

只读取与当前任务相关的文档，但下列规则是强制的：

| 任务类型 | 修改前必须读取 |
|---|---|
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

- 保持现有五目的地信息架构；除非用户明确要求重构，不新增一级导航或恢复旧的 per-tool 导航。
- 优先复用 `DestinationPage`、`SegmentedPageTabs`、`DialogShell` 和 `pagePrimitives.module.css` 等共享页面原语。
- 所有任务列表 Card 必须以 `app/routes/component/aiTask/AITaskCardShell.tsx` 为基础。Shell 负责容器、header、状态、进度、动作区和日志挂载；业务 Card 负责文案、进度计算、actions 与业务状态。
- 标准参考：`ProductImproveTaskCard.tsx`、`ImageGenerationTaskCard.tsx`、`PictureTranslateTaskCard.tsx`。
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
- Admin 没有配置测试框架；改动后必须在 `admin/` 中运行 `npm run build`。
- 修改共享 Prisma schema 后，主应用和 Admin 的 Prisma 类型/构建都要考虑。

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
- `npm run dev` 包装 `shopify app dev`，需要 Shopify CLI 登录和应用配置。
- 主应用服务端运行需要 Shopify 和 Turso 相关变量；AI、Cosmos、Blob、Redis、SES、飞书等能力按功能依赖相应变量。
- 单元测试位于 `tests/`；`scripts/*.test.cjs` 不属于 Vitest，需按脚本单独用 `node --test` 执行。
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
