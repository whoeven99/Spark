# 翻译功能 Agent 指南

## 目标
- 在 Shopify 嵌入式应用中提供「创建翻译任务」入口：向 Cosmos 写入任务元数据。
- 任务的实际拉取、翻译、写回由 **AgentTask Camunda TranslationV4** 执行（Cosmos `taskType=spark-transtion`）；Spark 仅创建任务元数据。
- **Cosmos 数据位置（Spark）**：`sparkcosmostest` → 数据库 `translation` → 容器 `translation_jobs`。Render 须配置相同 `COSMOS_ENDPOINT`/`COSMOS_KEY`；未设库表变量时默认即上述路径。日志搜 `[TranslationCosmos]`。

## 代码范围
- 路由入口：`app/routes/app.translation.tsx`
- 页面组件：`app/routes/page/TranslationPage.tsx`
- 首页对话：`app/server/chat-stream.ts`（SSE）流式响应中的 `translationTaskForm` 由 `ChatPage` 写入对应助手消息的 `translationTaskForm` 字段；`ChatMessages` 在同一条 AI Assistant 气泡内渲染 `TranslationTaskChatCard`；工具定义 `app/server/ai/tools/implementations/translationTaskFormTool.ts`，载荷解析 `app/server/ai/postprocess/translationTaskFormExtract.ts`
- 创建任务：`app/server/translation/translationPipelineCore.server.ts`（`createTranslationJob`：同店同源同目标已存在任务时**幂等**返回最近更新的那条，不重复写入；新建时仅写 Cosmos，并写入 `accessToken` 供 AgentTask 拉取/写回 Shopify，**勿**在列表/详情 API 中返回该字段）
- 类型：`app/routes/page/TranslationPage.tsx` 使用的 resource 类型见 `app/server/translation/types.ts`
- 持久化：`app/server/translation/cosmosJobStore.server.ts`
- 任务列表：`GET /api/translate/v4/tasks?shopName=&taskType=`（`api.translate.v4.tasks.ts`；`taskType` 可逗号分隔，默认 `spark-transtion,spark,json-runtime`）。`GET /api/translate/v3/json-runtime-tasks` 仍可用（兼容，不按 taskType 过滤）。
- AgentTask 代理：`app/routes/api.translate.v3.json-runtime-task-detail.ts`
- 运行时详情 UI：`app/routes/component/translation/JsonRuntimeTaskStatusPanel.tsx`

## 处理原则
1. 先确认影响范围，再修改对应最小文件集合。
2. 不在未明确要求下改动鉴权、部署、密钥处理。
3. Cosmos 任务状态枚举可能与历史数据共存；新增字段或状态时同步更新 `types.ts` 与 store。

## 自检清单
- 是否只改了翻译功能相关文件。
- `createTranslationJob` 的请求/响应是否与路由 `action` 一致。
- 是否补充或更新了 `translationPipelineCore.test.ts`。
- 是否避免引入新的 lint / typecheck 问题。
