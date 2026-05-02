# Spark 项目说明文档

## 1. 项目定位
- 这是一个嵌入式 Shopify App，核心能力是 `AI Assistant + 店铺运维诊断`。
- 当前两大用户入口：
  - `AI Assistant`：自然语言问答、店铺数据查询、运营建议、授权引导。
  - `诊断报告`：最近 7 天核心指标、健康状态与结论建议。

## 2. 技术栈与运行形态
- 前端：React + TypeScript + React Router（文件系统路由）。
- UI：Shopify Web Components（`s-*` 标签）+ App Bridge。
- 服务端：React Router action/loader + Shopify Admin GraphQL。
- AI：LangChain + ChatOpenAI 兼容接口（默认可走 DeepSeek Base URL）。
- 持久化：
  - Shopify session：Prisma + SQLite（`prisma/schema.prisma`）。
  - 广告/物流授权凭证：本地 JSON 文件（`.data/*.json`，按 shop 分组）。

## 3. 目录结构（迁移后，根目录即应用目录）
- `app/routes/`：页面路由与 API action/loader。
- `app/routes/page/`：聊天页核心页面组件。
- `app/routes/component/`：聊天消息与输入组件。
- `app/server/`：AI Agent、工具、授权凭证存储等服务逻辑。
- `prisma/`：数据库 schema 与迁移文件。
- `.github/workflows/`：CI/CD（Shopify deploy + Render deploy）。
- `.cursor/rules/`：Cursor 规则（包括本项目上下文规则）。

## 4. 核心路由地图
- 页面路由：
  - `app/routes/app.tsx`：应用壳、导航、鉴权入口。
  - `app/routes/app._index.tsx`：默认页，渲染 `ChatPage`。
  - `app/routes/app.additional.tsx`：诊断报告页。
- AI 聊天路由：
  - `app/routes/chat.ts` -> 转发到 `app/server/chat.ts` 的 action。
- 授权配置路由（均需 `authenticate.admin`）：
  - 广告：`app.ads.google.config.tsx` / `app.ads.tiktok.config.tsx` / `app.ads.microsoft.config.tsx`
  - 物流：`app.logistics.sf.config.tsx` / `app.logistics.fedex.config.tsx`
- 反馈路由：
  - `app.feedback.suggestion.tsx`：当前仅做基础校验并返回成功提示（未持久化）。

## 5. AI 聊天链路（端到端）
- 前端 `ChatPage` 调用 `POST /chat`，请求体 `{ message }`。
- 服务端 `app/server/chat.ts`：
  - 先做 Shopify admin 鉴权。
  - 创建与店铺上下文绑定的 Shopify 工具集。
  - 调用 `invokeChatAgent()` 获取回复。
- `app/server/ai/agent.ts`：
  - 系统提示词强制简体中文、鼓励结构化输出、避免 Markdown 表格。
  - 对 AI 输出做二次整理（表格转列表、格式润色）。
  - 若 agent 没有可用文本，使用 fallback 模型消息兜底。

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
- 存储位置：`.data/ad-auth-credentials.json` 与 `.data/logistics-provider-credentials.json`。
- 组织方式：`shop -> provider -> credential`。
- 现状：
  - 已做字段完整性校验与脱敏展示（mask）。
  - 未做加密存储、KMS、数据库托管。
- 安全建议：
  - 生产环境优先迁移到安全存储（DB + 加密）或密钥服务。
  - `.data` 文件禁止提交到仓库。

## 9. 运行与部署
- 常用命令（根目录执行）：
  - `npm run dev`：本地开发（Shopify CLI）。
  - `npm run build` / `npm run start`：构建与启动。
  - `npm run lint` / `npm run typecheck`：质量检查。
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

## 11. 文案与交互约定
- 角色命名统一使用：`AI Assistant`。
- 中文文案优先，保持简洁与可执行。
- 欢迎语、诊断文案、按钮文案要全局一致。
- 涉及指标输出时，优先列表与短段落，避免大段堆叠。

## 12. 改动落点指南（按需求类型）
- 改欢迎语/聊天 UI：`app/routes/page/ChatPage.tsx`、`app/routes/component/ChatMessages.tsx`。
- 改聊天行为/工具调用：`app/server/chat.ts`、`app/server/ai/agent.ts`。
- 加新 AI 工具：`app/server/ai/tool/*`，并在 `shopifyShopInfoTool.ts` 或工具聚合处注册。
- 改诊断指标：`app/routes/app.additional.tsx`（含查询、阈值、文案）。
- 改授权字段：对应 `app/routes/app.*.config.tsx` + `app/server/*CredentialStore.server.ts`。

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
