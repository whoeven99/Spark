/** 与 Spring TranslateTaskV3CosmosRepo.toStatusText / Cosmos statusText 对齐 */
export const TRANSLATE_TASK_V3_COSMOS_STATUS_LABELS: Record<string, string> = {
  INIT_PENDING: "等待初始化",
  TRANSLATE_PENDING: "初始化完成，翻译中",
  SAVE_PENDING: "翻译完成，写回shopify中",
  STOPPED_TOKEN_LIMIT: "额度不足",
  STOPPED: "手动暂停",
  VERIFY_PENDING: "写回完成，校验中",
  UNKNOWN: "未知状态",
};

/** 将 V3 Cosmos {@code statusText} 转为简体中文；未收录时回退为原始字符串 */
export function formatTranslateTaskV3CosmosStatusText(statusText?: string | null): string {
  if (statusText === undefined || statusText === null || statusText.trim() === "") return "—";
  const key = statusText.trim().toUpperCase();
  return TRANSLATE_TASK_V3_COSMOS_STATUS_LABELS[key] ?? statusText;
}
