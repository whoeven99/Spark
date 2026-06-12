import { ToolMessage } from "@langchain/core/messages";
import {
  coerceBatchTasksFormPayload,
  mergeBatchTasksPayloadWithContext,
  type BatchTasksFormPayload,
} from "../../../../lib/batchTasksFormPayload";
import { parseWorkspaceProductsFromText } from "../../../../lib/workspaceContextProducts";
import { extractMessageText } from "../../utils/langchainMessageText";
import { OPEN_BATCH_TASKS_FORM_TOOL_NAME } from "./batchTasks.form.tool";

function enrichFromWorkspaceContext(
  payload: BatchTasksFormPayload,
  lastUserText: string,
): BatchTasksFormPayload {
  return mergeBatchTasksPayloadWithContext(
    payload,
    parseWorkspaceProductsFromText(lastUserText),
  );
}

function toolMessageJsonPayloadString(m: ToolMessage): string | null {
  const fromText = extractMessageText(m).trim();
  if (fromText.startsWith("{")) return fromText;
  const c = m.content as unknown;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const s = JSON.stringify(c);
    return s.startsWith("{") ? s : null;
  }
  return null;
}

export function extractBatchTasksFormFromMessages(
  messages: unknown[],
  lastUserText = "",
): BatchTasksFormPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== OPEN_BATCH_TASKS_FORM_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    return enrichFromWorkspaceContext(coerceBatchTasksFormPayload(raw), lastUserText);
  }
  return undefined;
}

export function hasBatchTasksFormToolCall(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (
      ToolMessage.isInstance(msg) &&
      msg.name === OPEN_BATCH_TASKS_FORM_TOOL_NAME
    ) {
      return true;
    }
  }
  return false;
}

export function workspaceSelectedProductCount(lastUserText: string): number {
  return parseWorkspaceProductsFromText(lastUserText).length;
}

export function shouldSuppressProductImproveForBatch(lastUserText: string): boolean {
  return workspaceSelectedProductCount(lastUserText) >= 2;
}

export function resolveBatchTasksFormPayload(
  messages: unknown[],
  lastUserText: string,
): BatchTasksFormPayload | undefined {
  const fromTool = extractBatchTasksFormFromMessages(messages, lastUserText);
  if (fromTool && fromTool.products.length > 0) return fromTool;

  if (hasBatchTasksFormToolCall(messages)) {
    const base =
      fromTool ??
      coerceBatchTasksFormPayload({
        taskType: "product_improve",
        products: [],
        targetLanguage: "en",
        sourceLanguage: "auto",
      });
    const enriched = enrichFromWorkspaceContext(base, lastUserText);
    if (enriched.products.length > 0) return enriched;
  }

  return fromTool;
}
