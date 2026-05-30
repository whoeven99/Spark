# Spark 项目 README

Spark 是一个嵌入式 Shopify 应用，集成 AI Assistant、翻译 V3、商品描述生成、订阅计费等功能。

## 核心功能

1. **AI Assistant**（主页）- LangGraph ReAct Agent，支持 Shopify 数据查询、商品描述生成、整图翻译、模板邮件等
2. **诊断报告** - 7 天核心指标、健康状态评估
3. **翻译 V3** - JSON Runtime 任务创建与监控（Cosmos + Redis + Blob）
4. **生成商品描述** - 订阅制+按量计费（Shopify Billing）
5. **图片工具** - 整图翻译（火山 + Aidge）、文生图

## 快速开始

```bash
# 本地开发
npm run dev

# 代码质量检查
npm run lint && npm run typecheck && npm run test

# 生产构建
npm run build

# 数据库迁移（Turso）
npm run turso:migrate:test   # 测试库
npm run turso:migrate:prod   # 生产库
```

## 项目结构速查

| 路径 | 说明 |
|------|------|
| `app/routes/` | 页面与 API 路由 |
| `app/server/ai/` | AI Agent 链路（LangGraph + ReAct） |
| `app/server/generateDescription/` | 商品描述生成 |
| `app/server/translation/` | 翻译 V3 流水线 |
| `app/server/pictureTranslate/` | 图片翻译 |
| `app/server/billing/` | 订阅与计费 |
| `app/server/email/` | 邮件（腾讯 SES） |
| `prisma/` | 数据库 Schema + 迁移 |
| `docs/` | 项目文档（**改代码前必读**） |

## 改动指南

### 改代码前必读对应文档

- 改翻译 → `docs/translation-agent.md`
- 改生成描述 → `docs/generateDescription.md`
- 改计费/订阅 → `app/server/billing/agent.md`
- 改 tools 交互结构 → `docs/INTERACTION_DESIGN.md`
- 改 UI / 设计系统 → `docs/DESIGN.md`
- 改 Agent 摘要 → `docs/agent-run-log.md`
- 完整架构 → `docs/PROJECT_CONTEXT.md`

### 改代码后必须运行

```bash
npm run lint && npm run typecheck && npm run test
npm run build  # 推送前必须通过
```

## 常用路由

| 路由 | 说明 |
|------|------|
| `/app` | 应用壳、鉴权 |
| `/app/_index` | 首页（聊天） |
| `/app/additional` | 诊断报告 |
| `/app/translation` | 翻译页 |
| `/app/generate-description` | 生成描述页 |
| `/app/billing` | 订阅与计费页 |
| `/app/image-studio` | 图片工具 |
| `POST /chat-stream` | 聊天 SSE 流 |

## 数据存储

- **Turso (libSQL)**：Session、Account、订阅、建议、广告凭证、计费日志
- **Azure Cosmos DB**：翻译任务元数据、Agent 运行摘要
- **Azure Blob Storage**：翻译报表/chunk、图片翻译结果、生成图片
- **Redis**：翻译进度键、监控指标

## AI 工具

在 `app/server/ai/skills/index.ts` 中注册：

- `get_current_time` - 当前时间
- `get_weather` - 天气
- `get_shop_info` - 店铺信息
- `get_shop_kpis` - 经营指标
- `generate_product_description` - 生成描述
- `picture_translate` - 整图翻译
- `send_template_email` - 模板邮件

## 计费系统

- **启用应用**：`BILLING_ENABLED_APPS` 仅含 `generate-description`
- **网关**：`BILLING_GATEWAY=noop` 时本地生效（开发）
- **Token 池**：订阅赠送 + 购包 - 使用
- **校验**：生成描述 API 调用前通过 `hasTokenQuota()` 校验

## 快速诊断

**聊天不工作** → 检查 `app/server/chat-stream.ts` + `app/server/ai/graph/shopChatGraph.server.ts` + Shopify admin 鉴权

**工具不工作** → 检查 `app/server/ai/skills/index.ts` 注册 + 工具实现 + LangSmith

**翻译不工作** → 检查 `COSMOS_*`、`REDIS_*`、`BLOB_*` 环境变量 + `translationPipelineCore` 逻辑

**计费不工作** → 检查 `BILLING_GATEWAY` + `BILLING_ENABLED_APPS` + `hasTokenQuota()`

## 相关文档

- **[AGENT.md](./AGENT.md)** - Agent 专用上下文（详细代码结构、流程、诊断等）
- **[docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md)** - 完整架构与约定
- **[docs/translation-agent.md](./docs/translation-agent.md)** - 翻译功能设计
- **[docs/generateDescription.md](./docs/generateDescription.md)** - 生成描述方案
- **[app/server/billing/agent.md](./app/server/billing/agent.md)** - 计费系统详解
- **[docs/INTERACTION_DESIGN.md](./docs/INTERACTION_DESIGN.md)** - 任务型工具交互规范
- **[docs/DESIGN.md](./docs/DESIGN.md)** - 视觉系统与组件设计规范

## 环境配置

主要环境变量见 `docs/PROJECT_CONTEXT.md` 第 12 节。

关键依赖：Shopify Admin API、Azure Cosmos DB、Azure Blob Storage、Redis、Turso、DeepSeek/OpenAI API、腾讯 SES。
