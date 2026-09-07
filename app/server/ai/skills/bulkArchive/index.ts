import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkArchiveProposal } from "../../../../lib/productManageTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  bulkArchiveFormTool,
  OPEN_BULK_ARCHIVE_FORM_TOOL_NAME,
  type BulkArchiveFormPayload,
} from "./bulkArchive.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkArchiveFormPayload {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const products = Array.isArray(record.products)
    ? record.products
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          id: normalizeShopifyProductId(safeString(item.id) ?? ""),
          title: safeString(item.title) ?? "",
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        }))
        .filter((item) => item.id !== "")
    : [];
  return { products: products.map((item) => ({ ...item, title: item.title || item.id })) };
}

export const bulkArchiveSkillDefinition: ToolDefinition = {
  name: "bulkArchive",
  displayName: "归档商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "批量把商品归档为 Archived：先生成变更清单，用户确认后才写回。与下架为草稿不是同一件事。",
  systemPromptExtension: [
    `用户要归档商品时调用 ${OPEN_BULK_ARCHIVE_FORM_TOOL_NAME}。`,
    "归档 ≠ 下架为草稿。下架请用批量上下架。你不会立即归档，必须等用户确认。",
  ].join("\n"),
  createTool: () => [bulkArchiveFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_ARCHIVE_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkArchiveForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkArchiveForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildBulkArchiveProposal({ products }),
    });
  },
};
