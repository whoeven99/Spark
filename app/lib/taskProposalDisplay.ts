import type { TFunction } from "i18next";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
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
};

const SKILL_SUMMARY_KEYS: Record<string, string> = {
  [BATCH_PRODUCT_IMPROVE_SKILL_ID]: `${PREFIX}.skills.batchProductImprove.summary`,
  [BATCH_PICTURE_TRANSLATE_SKILL_ID]: `${PREFIX}.skills.batchPictureTranslate.summary`,
  [IMAGE_GENERATION_SKILL_ID]: `${PREFIX}.skills.imageGeneration.summary`,
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
  _fieldKey: string,
  value: string,
  t: TFunction,
): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

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

export function formatTaskProposalParamSummary(
  field: Pick<TaskProposalField, "key" | "label">,
  value: string,
  t: TFunction,
): string {
  return t(`${PREFIX}.paramSummary`, {
    label: resolveTaskProposalFieldLabel(field, t),
    value: resolveTaskProposalParamValueLabel(field.key, value, t),
  });
}

export function buildTaskRunParamsSummary(args: {
  skillId: string;
  params: Array<Pick<TaskProposalField, "key" | "label">>;
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
  fields?: Array<Pick<TaskProposalField, "key" | "label">>,
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
