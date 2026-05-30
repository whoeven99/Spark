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

export function detectClientNavigatorLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * 客户端解析 UI 语言（无 localStorage 手动选择时）：
 * 1. localStorage
 * 2. 服务端 loader 已解析结果（Cookie / Shopify locale / Accept-Language）
 * 3. 浏览器 navigator.languages
 * 4. 英语
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

  return detectClientNavigatorLocale();
}
