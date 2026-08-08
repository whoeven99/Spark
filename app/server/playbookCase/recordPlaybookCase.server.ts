import { randomUUID } from "node:crypto";
import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { extractMessageText } from "../ai/utils/langchainMessageText";
import { globalPlaybookRegistry } from "../ai/core/playbookRegistry.server";
import type { PlaybookRunResult } from "../ai/core/playbookRegistry.server";
import {
  isCosmosSparkOpsConfigured,
  isCosmosThroughputLimitError,
  SPARK_OPS_PLAYBOOK_CASES_CONTAINER,
} from "../cosmos/cosmosSparkOps.server";
import { upsertPlaybookCaseDoc } from "./cosmosPlaybookCaseStore.server";
import type {
  PlaybookCaseDoc,
  PlaybookCaseSeverity,
  PlaybookStructuredResult,
} from "./types.server";

const LOG_PREFIX = "[PlaybookCase]";
const PLAYBOOK_TOOL_PREFIX = "run_playbook_";

function toolMessageJsonPayloadString(message: ToolMessage): string | null {
  const fromText = extractMessageText(message).trim();
  if (fromText.startsWith("{")) return fromText;
  const content = message.content as unknown;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const raw = JSON.stringify(content);
    return raw.startsWith("{") ? raw : null;
  }
  return null;
}

function isPlaybookStructuredResult(value: unknown): value is PlaybookStructuredResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return (
    Array.isArray(rec.diagnosis) &&
    Array.isArray(rec.evidence) &&
    Array.isArray(rec.actions) &&
    Array.isArray(rec.reviewMetrics) &&
    Array.isArray(rec.followUps)
  );
}

function parsePlaybookRunResult(raw: string): PlaybookRunResult | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.summary !== "string") return null;
    if (!Array.isArray(rec.steps)) return null;
    return parsed as PlaybookRunResult;
  } catch {
    return null;
  }
}

function severityFromResult(result: PlaybookRunResult): PlaybookCaseSeverity {
  const draftSeverity = result.caseDraft?.severity;
  if (draftSeverity) return draftSeverity;
  if (!result.ok) return "watch";
  const hasRisk = result.structuredResult?.diagnosis.some(
    (item) => item.severity === "risk",
  );
  if (hasRisk) return "risk";
  const hasWatch = result.structuredResult?.diagnosis.some(
    (item) => item.severity === "watch",
  );
  return hasWatch ? "watch" : "info";
}

function snapshotDateFromResult(result: PlaybookRunResult): string | undefined {
  const value = result.data?.snapshotDate;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function snapshotIdFromResult(result: PlaybookRunResult): string | undefined {
  const value = result.data?.snapshotId;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function extractPlaybookCasesFromMessages(params: {
  messages: BaseMessage[];
  shop: string;
  appName?: "spark";
  agentRunId?: string;
  now?: string;
}): PlaybookCaseDoc[] {
  const shop = params.shop.trim();
  if (!shop) return [];
  const now = params.now ?? new Date().toISOString();
  const definitions = new Map(
    globalPlaybookRegistry.getRegistered().map((def) => [def.name, def]),
  );
  const cases: PlaybookCaseDoc[] = [];

  for (const message of params.messages) {
    if (!ToolMessage.isInstance(message)) continue;
    const toolName = message.name?.trim() ?? "";
    if (!toolName.startsWith(PLAYBOOK_TOOL_PREFIX)) continue;

    const playbookName = toolName.slice(PLAYBOOK_TOOL_PREFIX.length);
    const raw = toolMessageJsonPayloadString(message);
    if (!raw) continue;

    const result = parsePlaybookRunResult(raw);
    if (!result?.structuredResult || !isPlaybookStructuredResult(result.structuredResult)) {
      continue;
    }

    const def = definitions.get(playbookName);
    const title =
      result.caseDraft?.title ||
      def?.presentation?.entryTitle ||
      def?.displayName ||
      playbookName;
    const goal = typeof result.data?.goal === "string" ? result.data.goal : title;
    const constraints =
      typeof result.data?.constraints === "string" && result.data.constraints.trim()
        ? result.data.constraints
        : undefined;

    cases.push({
      id: randomUUID(),
      shop,
      appName: params.appName ?? "spark",
      playbookName,
      playbookDisplayName: def?.displayName ?? title,
      title,
      status: "open",
      severity: severityFromResult(result),
      goal,
      constraints,
      summary: result.summary,
      structuredResult: result.structuredResult,
      snapshotDate: snapshotDateFromResult(result),
      refs: {
        agentRunId: params.agentRunId,
        diagnosisSnapshotId: snapshotIdFromResult(result),
      },
      createdAt: now,
      updatedAt: now,
      reviewDueAt: result.caseDraft?.reviewDueAt,
    });
  }

  return cases;
}

function logRecordFailure(shop: string, error: unknown): void {
  if (!isCosmosSparkOpsConfigured()) {
    console.warn(
      `${LOG_PREFIX} skip upsert (COSMOS not configured) shop=${shop}`,
    );
    return;
  }
  if (isCosmosThroughputLimitError(error)) {
    console.error(
      `${LOG_PREFIX} upsert failed (Cosmos RU limit) shop=${shop}. ` +
        `Create container "${SPARK_OPS_PLAYBOOK_CASES_CONTAINER}" manually in Azure with shared throughput, or raise account RU.`,
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
      `${LOG_PREFIX} upsert failed (container not found) shop=${shop}. ` +
        `Ensure database spark_ops has container "${SPARK_OPS_PLAYBOOK_CASES_CONTAINER}" (partition key /shop).`,
    );
    return;
  }
  console.error(`${LOG_PREFIX} upsert failed shop=${shop}`, error);
}

export async function recordPlaybookCasesFromMessages(params: {
  messages: BaseMessage[];
  shop?: string;
  appName?: "spark";
  agentRunId?: string;
}): Promise<void> {
  const shop = params.shop?.trim();
  if (!shop) return;
  if (!isCosmosSparkOpsConfigured()) {
    console.warn(`${LOG_PREFIX} skip upsert (COSMOS not configured) shop=${shop}`);
    return;
  }

  const docs = extractPlaybookCasesFromMessages({
    messages: params.messages,
    shop,
    appName: params.appName,
    agentRunId: params.agentRunId,
  });
  if (docs.length === 0) return;

  for (const doc of docs) {
    try {
      await upsertPlaybookCaseDoc(doc);
      console.info(
        `${LOG_PREFIX} upsert ok caseId=${doc.id} shop=${shop} playbook=${doc.playbookName}`,
      );
    } catch (error) {
      logRecordFailure(shop, error);
    }
  }
}
