import type { i18n as I18nInstance } from "i18next";

/** 与 Spring TranslateTaskV3CosmosRepo / Spark cosmosJobStore STATUS_META 的 statusText 对齐 */
export const TRANSLATE_TASK_V3_COSMOS_STATUS_I18N_KEYS: Record<string, string> = {
  INIT_PENDING: "translationRuntime.cosmosStatusInitPending",
  TRANSLATE_PENDING: "translationRuntime.cosmosStatusTranslatePending",
  SAVE_PENDING: "translationRuntime.cosmosStatusSavePending",
  STOPPED_TOKEN_LIMIT: "translationRuntime.cosmosStatusStoppedTokenLimit",
  STOPPED: "translationRuntime.cosmosStatusStopped",
  VERIFY_PENDING: "translationRuntime.cosmosStatusVerifyPending",
  UNKNOWN: "translationRuntime.cosmosStatusUnknown",
  INIT_READING_SHOPIFY: "translationRuntime.cosmosStatusInitReadingShopify",
  INIT_DONE: "translationRuntime.cosmosStatusInitDone",
  TRANSLATE_RUNNING: "translationRuntime.cosmosStatusTranslateRunning",
  TRANSLATE_STOPPED_MANUAL: "translationRuntime.cosmosStatusPausedManual",
  TRANSLATE_DONE: "translationRuntime.cosmosStatusTranslateDone",
  SAVE_RUNNING: "translationRuntime.cosmosStatusSaveRunning",
  SAVE_DONE: "translationRuntime.cosmosStatusSaveDone",
  FAILED: "translationRuntime.cosmosStatusFailed",
};

/** 英文兜底：getResource / t 均失败时使用（避免界面出现 i18n key 字符串） */
const EN_FALLBACK_BY_STATUS: Record<string, string> = {
  INIT_PENDING: "Pending initialization",
  TRANSLATE_PENDING: "Initialization complete, translating",
  SAVE_PENDING: "Translation complete, writing back to Shopify",
  STOPPED_TOKEN_LIMIT: "Insufficient quota",
  STOPPED: "Paused manually",
  VERIFY_PENDING: "Write-back complete, verifying",
  UNKNOWN: "Unknown status",
  INIT_READING_SHOPIFY: "Reading Shopify data",
  INIT_DONE: "Initialization complete",
  TRANSLATE_RUNNING: "Translating",
  TRANSLATE_STOPPED_MANUAL: "Paused manually",
  TRANSLATE_DONE: "Translation complete",
  SAVE_RUNNING: "Writing back to Shopify",
  SAVE_DONE: "Completed",
  FAILED: "Failed",
};

export type CosmosStatusTranslateFn = (key: string) => string;

export type CosmosStatusI18n = Pick<
  I18nInstance,
  "language" | "resolvedLanguage" | "getResource" | "getResourceBundle"
>;

function readNestedString(bundle: unknown, dottedKey: string): string | undefined {
  const parts = dottedKey.split(".");
  let cur: unknown = bundle;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** 将 V3 Cosmos statusText 转为当前语言；未收录时回退为原始字符串 */
export function formatTranslateTaskV3CosmosStatusText(
  statusText: string | null | undefined,
  t: CosmosStatusTranslateFn,
  i18n: CosmosStatusI18n,
): string {
  if (statusText === undefined || statusText === null || statusText.trim() === "") return "—";
  const trimmed = statusText.trim();
  const upper = trimmed.toUpperCase();

  if (trimmed.startsWith("translationRuntime.")) {
    const fromBundle = resolveFromBundle(i18n, trimmed);
    if (fromBundle) return fromBundle;
    const viaT = t(trimmed);
    if (viaT !== trimmed) return viaT;
    return trimmed;
  }

  const i18nKey = TRANSLATE_TASK_V3_COSMOS_STATUS_I18N_KEYS[upper];
  if (!i18nKey) return trimmed;

  const fromBundle = resolveFromBundle(i18n, i18nKey);
  if (fromBundle) return fromBundle;

  const viaT = t(i18nKey);
  if (viaT !== i18nKey) return viaT;

  return EN_FALLBACK_BY_STATUS[upper] ?? trimmed;
}

function resolveFromBundle(i18n: CosmosStatusI18n, dottedKey: string): string | undefined {
  const lng = (i18n.resolvedLanguage ?? i18n.language)?.trim();
  if (!lng) return undefined;

  const direct = i18n.getResource(lng, "common", dottedKey);
  if (typeof direct === "string" && direct.length > 0) return direct;

  const bundle = i18n.getResourceBundle(lng, "common");
  return readNestedString(bundle, dottedKey);
}
