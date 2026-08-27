import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type SupportedLocale,
  normalizeLocale,
} from "./config";

export function readClientStoredLocale(): SupportedLocale | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return normalizeLocale(value);
}

/**
 * 客户端解析 UI 语言：
 * 1. localStorage（仅手动切换时写入）
 * 2. 服务端 loader 结果（Cookie 手动偏好 / 店铺主语言）
 * 3. 英语
 *
 * 不再用 navigator 覆盖店铺语言，避免未手动选择时被浏览器语言抢走。
 */
export function resolveClientLocale(serverLocale: SupportedLocale): SupportedLocale {
  const stored = readClientStoredLocale();
  if (stored) {
    return stored;
  }

  const fromServer = normalizeLocale(serverLocale);
  if (fromServer) {
    return fromServer;
  }

  return DEFAULT_LOCALE;
}
