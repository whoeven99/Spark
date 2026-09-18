export const OAUTH_POPUP_CHANNEL = "spark-oauth";
export const OAUTH_POPUP_STORAGE_KEY = "spark:oauth-popup-result";

export function readOAuthPopupStorageResult(
  expectedType?: string,
): Record<string, string> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(OAUTH_POPUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed.type !== "string") {
      localStorage.removeItem(OAUTH_POPUP_STORAGE_KEY);
      return null;
    }
    if (expectedType && parsed.type !== expectedType) return null;
    localStorage.removeItem(OAUTH_POPUP_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}
