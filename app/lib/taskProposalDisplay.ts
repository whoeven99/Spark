import type { TFunction } from "i18next";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  BULK_COLLECTION_EDIT_SKILL_ID,
  BULK_INVENTORY_IMPORT_SKILL_ID,
  BULK_METAFIELD_EDIT_SKILL_ID,
  BULK_PRICE_EDIT_SKILL_ID,
  BULK_STATUS_EDIT_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
  isResourceOptionField,
  PRODUCT_IMPROVE_LANGUAGE_OPTIONS,
  type TaskProposalField,
  type TaskProposalPayload,
  type TaskProposalTargetKind,
} from "./taskProposalPayload";
import type { TaskRunPayload } from "./taskRunPayload";

const PREFIX = "workspace.taskProposal";

const SKILL_TITLE_KEYS: Record<string, string> = {
  [BATCH_PRODUCT_IMPROVE_SKILL_ID]: `${PREFIX}.skills.batchProductImprove.title`,
  [BATCH_PICTURE_TRANSLATE_SKILL_ID]: `${PREFIX}.skills.batchPictureTranslate.title`,
  [IMAGE_GENERATION_SKILL_ID]: `${PREFIX}.skills.imageGeneration.title`,
  [BULK_PRICE_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkPriceEdit.title`,
  [BULK_STATUS_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkStatusEdit.title`,
  [BULK_COLLECTION_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkCollectionEdit.title`,
  [BULK_METAFIELD_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkMetafieldEdit.title`,
  [BULK_INVENTORY_IMPORT_SKILL_ID]: `${PREFIX}.skills.bulkInventoryImport.title`,
};

/**
 * 一个提案只创建一个任务（而不是每个对象一个）的技能。
 * 卡片据此把「将创建 N 个任务」改成「为 N 个对象创建 1 个任务」。
 */
const SINGLE_TASK_SKILL_IDS = new Set<string>([
  BULK_PRICE_EDIT_SKILL_ID,
  BULK_STATUS_EDIT_SKILL_ID,
  BULK_COLLECTION_EDIT_SKILL_ID,
  BULK_METAFIELD_EDIT_SKILL_ID,
]);

export function isSingleTaskProposalSkill(skillId: string): boolean {
  return SINGLE_TASK_SKILL_IDS.has(skillId);
}

const SKILL_SUMMARY_KEYS: Record<string, string> = {
  [BATCH_PRODUCT_IMPROVE_SKILL_ID]: `${PREFIX}.skills.batchProductImprove.summary`,
  [BATCH_PICTURE_TRANSLATE_SKILL_ID]: `${PREFIX}.skills.batchPictureTranslate.summary`,
  [IMAGE_GENERATION_SKILL_ID]: `${PREFIX}.skills.imageGeneration.summary`,
  [BULK_PRICE_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkPriceEdit.summary`,
  [BULK_STATUS_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkStatusEdit.summary`,
  [BULK_COLLECTION_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkCollectionEdit.summary`,
  [BULK_METAFIELD_EDIT_SKILL_ID]: `${PREFIX}.skills.bulkMetafieldEdit.summary`,
  [BULK_INVENTORY_IMPORT_SKILL_ID]: `${PREFIX}.skills.bulkInventoryImport.summary`,
};

/** 历史消息仅有 taskType 时映射到 skillId，便于侧栏标题 i18n */
const TASK_TYPE_TO_SKILL_ID: Record<string, string> = {
  product_improve: BATCH_PRODUCT_IMPROVE_SKILL_ID,
  picture_translate: BATCH_PICTURE_TRANSLATE_SKILL_ID,
  image_generation: IMAGE_GENERATION_SKILL_ID,
};

export function skillIdFromAiTaskType(taskType: string): string | undefined {
  return TASK_TYPE_TO_SKILL_ID[taskType];
}

const FIELD_LABEL_KEYS: Record<string, string> = {
  targetLanguage: `${PREFIX}.fields.targetLanguage`,
  sourceLanguage: `${PREFIX}.fields.sourceLanguage`,
  description: `${PREFIX}.fields.description`,
  priceMode: `${PREFIX}.fields.priceMode`,
  priceValue: `${PREFIX}.fields.priceValue`,
  rounding: `${PREFIX}.fields.rounding`,
  compareAtMode: `${PREFIX}.fields.compareAtMode`,
  minPrice: `${PREFIX}.fields.minPrice`,
};

const TARGET_KIND_KEYS: Record<TaskProposalTargetKind, string> = {
  products: `${PREFIX}.targetKinds.products`,
  articles: `${PREFIX}.targetKinds.articles`,
  orders: `${PREFIX}.targetKinds.orders`,
  none: `${PREFIX}.targetKinds.none`,
};

/** 已知 disabledReason 稳定码 / 历史文案 → i18n key */
const DISABLED_REASON_KEYS: Record<string, string> = {
  no_primary_image: `${PREFIX}.disabledReasons.noImage`,
  无主图: `${PREFIX}.disabledReasons.noImage`,
  "No main image": `${PREFIX}.disabledReasons.noImage`,
};

function fieldLabelKey(fieldKey: string): string {
  return FIELD_LABEL_KEYS[fieldKey] ?? `${PREFIX}.fields.${fieldKey}`;
}

export function resolveTaskProposalTitle(
  proposal: Pick<TaskProposalPayload, "skillId" | "title">,
  t: TFunction,
): string {
  const key = SKILL_TITLE_KEYS[proposal.skillId];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return proposal.title;
}

export function resolveTaskProposalSummary(
  proposal: Pick<TaskProposalPayload, "skillId" | "summary">,
  t: TFunction,
): string | undefined {
  const key = SKILL_SUMMARY_KEYS[proposal.skillId];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return proposal.summary;
}

export function resolveTaskProposalFieldLabel(field: Pick<TaskProposalField, "key" | "label">, t: TFunction): string {
  const key = fieldLabelKey(field.key);
  const translated = t(key, { defaultValue: field.label });
  return translated === key ? field.label : translated;
}

function languageCatalogKeys(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const underscored = lower.replace(/-/g, "_");
  const keys = [`language.${underscored}`, `language.${lower}`, `language.${trimmed}`];
  if (lower === "zh-cn" || lower === "zh_cn" || lower === "zh-hans") {
    keys.push("language.zh");
  }
  if (lower === "zh-tw" || lower === "zh_tw" || lower === "zh-hant") {
    keys.push("language.zh-tw");
  }
  return keys;
}

export function resolveTaskProposalParamValueLabel(
  fieldKey: string,
  value: string,
  t: TFunction,
): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  // 枚举型参数（调价方式、取整方式等）：按 字段.取值 查表，没有条目时继续走语言/原值回退
  const enumLabel = t(`${PREFIX}.paramValues.${fieldKey}.${trimmed}`, { defaultValue: "" });
  if (enumLabel) return enumLabel;

  for (const languageKey of languageCatalogKeys(trimmed)) {
    const languageLabel = t(languageKey, { defaultValue: "" });
    if (languageLabel) return languageLabel;
  }

  const productImproveOption = PRODUCT_IMPROVE_LANGUAGE_OPTIONS.find((o) => o.value === trimmed);
  if (productImproveOption) return productImproveOption.label;

  return trimmed;
}

export function resolveTaskProposalDisabledReason(reason: string, t: TFunction): string {
  const key = DISABLED_REASON_KEYS[reason];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return reason;
}

export function resolveTaskProposalTargetKind(kind: TaskProposalTargetKind, t: TFunction): string {
  const key = TARGET_KIND_KEYS[kind];
  return t(key);
}

/** 摘要行里的字段：资源类字段（合集等）需要 type + options 才能把 GID 换成人看得懂的名字。 */
export type TaskProposalSummaryField = Pick<TaskProposalField, "key" | "label"> &
  Partial<Pick<TaskProposalField, "type" | "options">>;

export function formatTaskProposalParamSummary(
  field: TaskProposalSummaryField,
  value: string,
  t: TFunction,
): string {
  // 枚举字段的 label 是中文硬编码，必须走 i18n；资源字段的 label 是店铺真实名称，直接用
  const resourceLabel = isResourceOptionField(field.type ?? "text")
    ? field.options?.find((option) => option.value === value)?.label
    : undefined;
  return t(`${PREFIX}.paramSummary`, {
    label: resolveTaskProposalFieldLabel(field, t),
    value: resourceLabel ?? resolveTaskProposalParamValueLabel(field.key, value, t),
  });
}

export function buildTaskRunParamsSummary(args: {
  skillId: string;
  params: TaskProposalSummaryField[];
  paramValues: Record<string, string>;
  t: TFunction;
}): string[] {
  return args.params.map((field) =>
    formatTaskProposalParamSummary(field, args.paramValues[field.key] ?? "", args.t),
  );
}

export function resolveTaskRunTitle(run: Pick<TaskRunPayload, "skillId" | "title">, t: TFunction): string {
  return resolveTaskProposalTitle(run, t);
}

export function resolveTaskRunParamsSummaryLines(
  run: Pick<TaskRunPayload, "skillId" | "title" | "paramsSummary"> & {
    params?: Record<string, string>;
  },
  t: TFunction,
  fields?: TaskProposalSummaryField[],
): string[] {
  if (run.params && fields && fields.length > 0) {
    return buildTaskRunParamsSummary({
      skillId: run.skillId,
      params: fields,
      paramValues: run.params,
      t,
    });
  }
  if (run.params && Object.keys(run.params).length > 0) {
    return Object.entries(run.params).map(([key, value]) =>
      formatTaskProposalParamSummary({ key, label: key }, value, t),
    );
  }
  return run.paramsSummary.map((line) => relocalizeLegacyParamSummaryLine(line, t));
}

/** 历史落库摘要仅含中文标签前缀时，按字段 key 重新本地化 */
export function relocalizeLegacyParamSummaryLine(line: string, t: TFunction): string {
  const patterns: Array<{ regex: RegExp; fieldKey: string }> = [
    { regex: /^(?:目标语言|Target language)\s*[：:]\s*(.+)$/i, fieldKey: "targetLanguage" },
    { regex: /^(?:源语言|Source language)\s*[：:]\s*(.+)$/i, fieldKey: "sourceLanguage" },
  ];
  for (const { regex, fieldKey } of patterns) {
    const match = line.match(regex);
    if (match?.[1]) {
      return formatTaskProposalParamSummary({ key: fieldKey, label: fieldKey }, match[1].trim(), t);
    }
  }
  return line;
}
