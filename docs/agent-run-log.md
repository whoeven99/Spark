# Agent Run Log

Agent 每次调用的**摘要**写入 Azure Cosmos DB（`spark_ops` / `agent_runs`），与 LangSmith trace 互链。完整对话轨迹仍以 LangSmith 为准（开启 `LANGCHAIN_TRACING_V2` 时）。

## 存储

| 项 | 值 |
|----|-----|
| Database | `COSMOS_OPS_DATABASE_ID`，默认 `spark_ops` |
| Container | `COSMOS_AGENT_RUNS_CONTAINER`，默认 `agent_runs` |
| Partition key | `/shop` |
| TTL | 容器默认 90 天（`defaultTtl: 7776000`） |

容器须已在 Azure Portal 手动创建（与店铺画像一致）。**聊天/写入热路径绝不** `createIfNotExists`。仅本地运维脚本在设 `COSMOS_SPARK_OPS_AUTO_CREATE=true` 时可尝试自动建容器。创建步骤见 **`docs/shop-profile.md` §「首次在 Azure 创建 agent_runs」**。

**勿**在 Render/生产环境设 `COSMOS_SPARK_OPS_AUTO_CREATE=true`，否则会触发账户 RU 配额错误（日志里 `total throughput limit` / `1600 RU/s`）。

写入失败时服务端日志关键字：`[AgentRunLog] upsert failed`（容器不存在或 RU 超限时会附带可操作说明）。

不写入 Blob；不存 accessToken、完整 messages（仅 `inputSummary` 截断摘要）。

## 环境变量

与翻译共用：`COSMOS_ENDPOINT`、`COSMOS_KEY`。

| 变量 | 默认 | 说明 |
|------|------|------|
| `COSMOS_OPS_DATABASE_ID` | `spark_ops` | 运维库 |
| `COSMOS_AGENT_RUNS_CONTAINER` | `agent_runs` | 运行摘要容器 |
| `AGENT_RUN_LOG_ENABLED` | `true` | 设为 `false` 关闭写入 |
| `AGENT_RUN_TIMEOUT_MS` | `120000` | 超过则记 `timeout` |
| `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` | — | 开启后写入 `langsmithRunId` |

## 文档字段

见 `app/server/agentRunLog/types.server.ts` 中 `AgentRunDoc`。

## 已接入 feature

- `chat`：`invokeChatAgent`
- `chat_stream`：`invokeChatAgentStream`
- `generate_description`：`executeGenerateDescriptionRequest`
- `picture_translate`：`executePictureTranslateRequest`

**待定**：`translation` 索引、日批 regression、Vitest 回归（见产品计划）。

## LangSmith 互链

- 每次调用生成 `runId`（Cosmos `id`），并作为 `runName` / `metadata.sparkRunId` 传入 LangGraph。
- 若启用 tracing，从 `RunCollectorCallbackHandler.tracedRuns` 取 root `langsmithRunId`。
- 响应仍可带 `langsmithTraceUrl`（需有效 `langsmithRunId`）。

## 卸载

店铺卸载时删除 partition 内 `agent_runs`：**待定**（与 regression 一并实现）。
