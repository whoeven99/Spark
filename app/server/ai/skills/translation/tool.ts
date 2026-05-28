import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  TRANSLATION_V4_MODULES,
} from "../../../translation/v4/types";
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
  const allowed = new Set<string>(TRANSLATION_V4_MODULES);
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

function normalizeTargetLocales(
  targetLocales: string[] | undefined,
  targetLocale: string | undefined,
): string[] {
  const fromList = (targetLocales ?? [])
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (fromList.length) {
    const seen = new Set<string>();
    return fromList.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }
  const single = (targetLocale ?? "").trim().toLowerCase();
  return single ? [single] : [];
}

/**
 * 当用户要创建翻译任务时调用：在首页展示可编辑表单卡片（不直接写入 Cosmos）。
 * 返回 JSON 字符串供服务端解析并下发给前端。
 */
export const translationTaskFormTool = new DynamicStructuredTool({
  name: OPEN_TRANSLATION_TASK_FORM_TOOL_NAME,
  description:
    "当用户明确表示要创建翻译任务、批量翻译商品/集合/页面等时使用。源语言由店铺主语言决定，卡片内不可改；根据对话尽量填入目标语言（可多个）、条目上限与模块，目标语言须为店铺已启用语言之一。用户说「翻译成法语和日语」等时填 targetLocales。不要在未提及翻译任务时调用。",
  schema: z.object({
    sourceLocale: z
      .string()
      .optional()
      .describe("已废弃：源语言由店铺主语言自动确定，可忽略"),
    targetLocale: z
      .string()
      .optional()
      .describe("单个目标语言 locale（BCP47）；与 targetLocales 二选一"),
    targetLocales: z
      .array(z.string())
      .optional()
      .describe("多个目标语言 locale，如 [\"fr\", \"ja\"]"),
    limitPerType: z
      .number()
      .optional()
      .describe("每种资源类型最多抓取条目数，默认 20，上限 200"),
    resourceTypes: z
      .array(z.string())
      .optional()
      .describe(
        "翻译模块：PRODUCT、PRODUCT_OPTION、PRODUCT_OPTION_VALUE、COLLECTION、ONLINE_STORE_THEME_APP_EMBED、ONLINE_STORE_THEME_JSON_TEMPLATE、ONLINE_STORE_THEME_SECTION_GROUP、ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS、MENU、LINK、DELIVERY_METHOD_DEFINITION、FILTER、METAFIELD、METAOBJECT、PAYMENT_GATEWAY、SELLING_PLAN、SELLING_PLAN_GROUP、SHOP、ARTICLE、BLOG、PAGE；缺省为 PRODUCT/COLLECTION/PAGE/ARTICLE",
      ),
  }),
  func: async ({ sourceLocale, targetLocale, targetLocales, limitPerType, resourceTypes }) => {
    const locales = normalizeTargetLocales(targetLocales, targetLocale);
    const payload: TranslationTaskFormPayload & {
      _sparkKind: typeof TRANSLATION_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: TRANSLATION_FORM_PAYLOAD_KIND,
      sourceLocale: (sourceLocale ?? "zh-CN").trim().toLowerCase() || "zh-cn",
      targetLocale: locales[0] ?? "",
      ...(locales.length ? { targetLocales: locales } : {}),
      limitPerType: normalizeLimit(limitPerType),
      resourceTypes: normalizeModules(resourceTypes),
    };
    return JSON.stringify(payload);
  },
});
