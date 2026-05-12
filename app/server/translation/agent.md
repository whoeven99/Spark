# 翻译功能 Agent 指南

## 目标
- 在 Shopify 嵌入式应用中提供「创建翻译任务」入口：向 Cosmos 写入任务元数据。
- 任务的实际拉取、翻译、写回等由后端其他服务（如 AgentTask）执行；Spark 不再内置多步流水线。

## 代码范围
- 路由入口：`app/routes/app.translation.tsx`
- 页面组件：`app/routes/page/TranslationPage.tsx`
- 首页对话：`app/server/chat.ts` 响应中的 `translationTaskForm` 由 `ChatPage` 写入对应助手消息的 `translationTaskForm` 字段；`ChatMessages` 在同一条 AI Assistant 气泡内渲染 `TranslationTaskChatCard`；工具定义 `app/server/ai/tool/translationTaskFormTool.ts`，载荷解析 `app/server/ai/translationTaskFormExtract.ts`
- 创建任务：`app/server/translation/translationPipelineCore.server.ts`（仅 `createTranslationJob`；同店同源同目标 Cosmos 已有一条任务则拒绝并返回「任务已存在」）
- 类型：`app/routes/page/TranslationPage.tsx` 使用的 resource 类型见 `app/server/translation/types.ts`
- 持久化：`app/server/translation/cosmosJobStore.server.ts`
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
