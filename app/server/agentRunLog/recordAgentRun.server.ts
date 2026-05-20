import { randomUUID } from "node:crypto";
import { LANGSMITH_CONFIG } from "../ai/utils/langsmith.server";
import { upsertAgentRunDoc } from "./cosmosAgentRunStore.server";
import { sanitizeErrorMessage } from "./sanitize.server";
import type { RecordAgentRunInput } from "./types.server";

const LOG_PREFIX = "[AgentRunLog]";

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

/** 异步写入 Cosmos；失败仅打日志，不抛给调用方。 */
export function recordAgentRun(input: RecordAgentRunInput): void {
  if (!isAgentRunLogEnabled()) return;
  const shop = input.shop?.trim();
  if (!shop) return;

  void (async () => {
    try {
      await upsertAgentRunDoc(toDoc(input));
    } catch (error) {
      console.error(
        `${LOG_PREFIX} upsert failed runId=${input.runId} shop=${shop} feature=${input.feature}`,
        error,
      );
    }
  })();
}
