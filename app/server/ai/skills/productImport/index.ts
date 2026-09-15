import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { buildProductImportProposal } from "../../../../lib/productManageTaskProposals";
import {
  coerceProductImportIssues,
  coerceProductImportOperations,
  collapseRepeatedImportIssues,
  filterActionableImportIssues,
  PRODUCT_IMPORT_REVIEW_SAMPLE_LIMIT,
  type ProductImportIssue,
} from "../../../../lib/productImport";
import { listRecentTasksForShop } from "../../../aiTask/aiTaskStore.server";
import { initI18n } from "../../../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../../../i18n/config";
import {
  OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME,
  productImportFormTool,
  type ProductImportFormPayload,
} from "./productImport.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): ProductImportFormPayload {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const operations = coerceProductImportOperations(record.operations);
  return {
    ...(safeString(record.fileId) ? { fileId: safeString(record.fileId) } : {}),
    ...(safeString(record.fileName) ? { fileName: safeString(record.fileName) } : {}),
    ...(operations.length > 0 ? { operations } : {}),
  };
}

const BASE_EXTENSION = [
  `用户要导入商品、按表格批量改价/标签/状态/字段/合集/复制/归档/删除时，立刻调用 ${OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME}。没有文件也要先开卡，不要只在对话里让对方去上传完再来。`,
  "若用户明确只要改某一类（例如只改价格或只改 SEO），把 operations 预填成对应 key；否则留空，让商户在卡片上自己勾选。开卡时只说接下来怎么勾选和上传，不要复述支持/不支持字段清单，也不要写「一期不做」「补充两点」或「用表格新建商品、改库存数量、改销售渠道」。",
  "不要再打开批量调价/打标/上下架那些独立确认卡。改字段/SEO、合集、复制、归档、成本、Handle、Metafield、删除没有独立入口，一律走导入卡上的对应子功能。",
  "内部约束（不要写给商户）：不要承诺用表格新建商品、改库存数量或改销售渠道；商户主动问到再简短说明校验报告会标出。",
  "开卡时不要说已经拿到校验结果，也不要承诺会直接改表格。等下面出现【当前导入校验结果】后，再按行号说明怎么改；不要改文件本身，让商户改表后重新上传再校验。",
].join("\n");

function formatReviewIssue(
  issue: ProductImportIssue,
  t: (key: string, options?: Record<string, string | number>) => string,
): string {
  const problem = t(`productImport.issue.${issue.code}`, { defaultValue: issue.code });
  const fix = t(`productImport.fix.${issue.code}`, { defaultValue: "" });
  const heading =
    issue.rowNumber > 0
      ? t("productImport.sheetPreview.issueRow", { row: issue.rowLabel || issue.rowNumber, problem })
      : problem;
  const column = issue.column ? ` · ${issue.column}` : "";
  const value = issue.value ? ` · ${issue.value}` : "";
  return fix
    ? `${heading}${column}${value}。${t("productImport.sheetPreview.issueFix", { fix })}`
    : `${heading}${column}${value}`;
}

async function productImportSystemPromptExtension(context: AgentContext): Promise<string> {
  const shop = context.shop?.trim();
  if (!shop) return BASE_EXTENSION;
  try {
    const tasks = await listRecentTasksForShop({ shop, taskType: "product_import", limit: 5 });
    const task = tasks.find((item) => item.status === "pending_review" && item.result);
    if (!task?.result) return BASE_EXTENSION;
    const issues = collapseRepeatedImportIssues(
      filterActionableImportIssues(coerceProductImportIssues(task.result.issues)),
    );
    const locale = normalizeLocale(context.locale) ?? DEFAULT_LOCALE;
    const i18n = initI18n(locale);
    const t = (key: string, options?: Record<string, string | number>) =>
      String(i18n.t(key, options));
    if (issues.length === 0) {
      return `${BASE_EXTENSION}\n\n【当前导入校验结果】没有必须先改的问题行。商户可以去审核页确认写回；不要再开一张空确认卡。`;
    }
    const samples = issues.slice(0, PRODUCT_IMPORT_REVIEW_SAMPLE_LIMIT);
    const lines = samples.map((issue) => `- ${formatReviewIssue(issue, t)}`).join("\n");
    const more =
      issues.length > samples.length ? `\n另有 ${issues.length - samples.length} 条问题未列出，完整清单在审核页。` : "";
    return `${BASE_EXTENSION}\n\n【当前导入校验结果】需修改 ${issues.length} 条。用户问怎么改时按下面清单逐条回答，不要再开空确认卡，也不要声称已改文件。\n${lines}${more}`;
  } catch {
    return BASE_EXTENSION;
  }
}

export const productImportSkillDefinition: ToolDefinition = {
  name: "productImport",
  displayName: "导入商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "在确认卡上勾选要写入的子功能并上传 CSV / Excel。勾选哪项，试算和写回就只走对应模块。先校验再确认写回。",
  systemPromptExtension: productImportSystemPromptExtension,
  createTool: () => [productImportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("productImportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("productImportForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const fileId = payload.fileId ?? streamContext.fileIds?.[0];
    enqueue({
      type: "task_proposal",
      payload: buildProductImportProposal({
        ...payload,
        ...(fileId ? { fileId } : {}),
      }),
    });
  },
};
