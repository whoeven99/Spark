import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ALLOWED_TRANSLATABLE_RESOURCE_TYPES,
} from "../../../translation/types";
import {
  TRANSLATION_FORM_PAYLOAD_KIND,
  type TranslationTaskFormPayload,
} from "../../../../lib/translationTaskFormPayload";

export const OPEN_TRANSLATION_TASK_FORM_TOOL_NAME = "open_translation_task_form";

const DEFAULT_MODULES: TranslationTaskFormPayload["resourceTypes"] = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "ARTICLE",
];

function normalizeModules(input: string[] | undefined): string[] {
  const allowed = new Set<string>(ALLOWED_TRANSLATABLE_RESOURCE_TYPES);
  const picked = (input ?? [])
    .map((item) => item.trim().toUpperCase())
    .filter((item) => allowed.has(item));
  return picked.length ? picked : [...DEFAULT_MODULES];
}

function normalizeLimit(n: number | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 20;
  return Math.min(200, Math.floor(v));
}

/**
 * 当用户要创建翻译任务时调用：在首页展示可编辑表单卡片（不直接写入 Cosmos）。
 * 返回 JSON 字符串供服务端解析并下发给前端。
 */
export const translationTaskFormTool = new DynamicStructuredTool({
  name: OPEN_TRANSLATION_TASK_FORM_TOOL_NAME,
  description:
    "当用户明确表示要创建翻译任务、批量翻译商品/集合/页面等时使用。根据对话尽量填入源语言、目标语言、条目上限与模块；不确定的字段可留空由店主在卡片里填写。不要在未提及翻译任务时调用。",
  schema: z.object({
    sourceLocale: z
      .string()
      .optional()
      .describe("源语言 locale（BCP47），如 zh-CN；默认 zh-CN"),
    targetLocale: z
      .string()
      .optional()
      .describe("目标语言 locale，如 fr、ja、en；未知则留空"),
    limitPerType: z
      .number()
      .optional()
      .describe("每种资源类型最多抓取条目数，默认 20，上限 200"),
    resourceTypes: z
      .array(z.string())
      .optional()
      .describe(
        "翻译模块：PRODUCT、COLLECTION、PAGE、ARTICLE、METAOBJECT、METAFIELD、ONLINE_STORE_THEME；缺省为 PRODUCT/COLLECTION/PAGE/ARTICLE",
      ),
  }),
  func: async ({ sourceLocale, targetLocale, limitPerType, resourceTypes }) => {
    const payload: TranslationTaskFormPayload & {
      _sparkKind: typeof TRANSLATION_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: TRANSLATION_FORM_PAYLOAD_KIND,
      sourceLocale: (sourceLocale ?? "zh-CN").trim().toLowerCase() || "zh-cn",
      targetLocale: (targetLocale ?? "").trim().toLowerCase(),
      limitPerType: normalizeLimit(limitPerType),
      resourceTypes: normalizeModules(resourceTypes),
    };
    return JSON.stringify(payload);
  },
});
