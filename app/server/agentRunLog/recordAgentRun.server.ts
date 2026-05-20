import { randomUUID } from "node:crypto";
import { LANGSMITH_CONFIG } from "../ai/utils/langsmith.server";
import {
  isCosmosSparkOpsConfigured,
  isCosmosThroughputLimitError,
  SPARK_OPS_AGENT_RUNS_CONTAINER,
} from "../cosmos/cosmosSparkOps.server";
import { upsertAgentRunDoc } from "./cosmosAgentRunStore.server";
import { sanitizeErrorMessage } from "./sanitize.server";
import type { RecordAgentRunInput } from "./types.server";

const LOG_PREFIX = "[AgentRunLog]";
let warnedAutoCreateEnv = false;

function warnIfAutoCreateEnvEnabled(): void {
  if (warnedAutoCreateEnv) return;
  const raw = process.env.COSMOS_SPARK_OPS_AUTO_CREATE?.trim().toLowerCase();
  if (raw === "true" || raw === "1") {
    warnedAutoCreateEnv = true;
    console.warn(
      `${LOG_PREFIX} COSMOS_SPARK_OPS_AUTO_CREATE=${raw} is set but chat/agent-run hot paths no longer auto-create containers. ` +
        `Remove this env on app servers to avoid confusion; create agent_runs in Azure Portal instead.`,
    );
  }
}

export function isAgentRunLogEnabled(): boolean {
  const raw = process.env.AGENT_RUN_LOG_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

export function createAgentRunId(): string {
  return randomUUID();
}

function toDoc(input: RecordAgentRunInput) {
  return {
    id: input.runId,
    shop: input.shop.trim(),
    appName: input.appName,
    feature: input.feature,
    status: input.status,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    langsmithRunId: input.langsmithRunId,
    langsmithProject: LANGSMITH_CONFIG.projectName,
    inputSummary: input.inputSummary,
    tools: input.tools,
    tokenUsage: input.tokenUsage,
    error: input.error
      ? {
          code: input.error.code,
          message: sanitizeErrorMessage(input.error.message),
        }
      : undefined,
    refs: input.refs,
    reflection: input.reflection,
    allowTraining: true,
  };
}

function logUpsertFailure(
  input: RecordAgentRunInput,
  shop: string,
  error: unknown,
): void {
  if (!isCosmosSparkOpsConfigured()) {
    console.error(
      `${LOG_PREFIX} skip upsert (COSMOS_ENDPOINT/COSMOS_KEY missing) runId=${input.runId} shop=${shop} feature=${input.feature}`,
    );
    return;
  }
  if (isCosmosThroughputLimitError(error)) {
    console.error(
      `${LOG_PREFIX} upsert failed (Cosmos RU limit) runId=${input.runId} shop=${shop} feature=${input.feature}. ` +
        `Create container "${SPARK_OPS_AGENT_RUNS_CONTAINER}" manually in Azure with shared throughput, or raise account RU.`,
    );
    return;
  }
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
      ? (error as { code: number }).code
      : undefined;
  if (code === 404) {
    console.error(
      `${LOG_PREFIX} upsert failed (container not found) runId=${input.runId} shop=${shop} feature=${input.feature}. ` +
        `Ensure database spark_ops has container "${SPARK_OPS_AGENT_RUNS_CONTAINER}" (partition key /shop). See docs/shop-profile.md.`,
    );
    return;
  }
  console.error(
    `${LOG_PREFIX} upsert failed runId=${input.runId} shop=${shop} feature=${input.feature}`,
    error,
  );
}

/**
 * 写入 Cosmos。流式聊天路径应 `await`，避免 SSE 响应结束后后台写入未落盘。
 * 失败仅打日志，不抛给调用方。
 */
export async function recordAgentRun(input: RecordAgentRunInput): Promise<void> {
  if (!isAgentRunLogEnabled()) return;
  const shop = input.shop?.trim();
  if (!shop) {
    console.warn(
      `${LOG_PREFIX} skip upsert (no shop) runId=${input.runId} feature=${input.feature}`,
    );
    return;
  }
  if (!isCosmosSparkOpsConfigured()) {
    console.warn(
      `${LOG_PREFIX} skip upsert (COSMOS not configured) runId=${input.runId} feature=${input.feature}`,
    );
    return;
  }
  warnIfAutoCreateEnvEnabled();

  try {
    await upsertAgentRunDoc(toDoc(input));
    console.info(
      `${LOG_PREFIX} upsert ok runId=${input.runId} shop=${shop} feature=${input.feature}`,
    );
  } catch (error) {
    logUpsertFailure(input, shop, error);
  }
}
