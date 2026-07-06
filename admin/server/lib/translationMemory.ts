import { createHash } from "node:crypto";

/** 与 worker `translationMemory.ts` 保持一致。 */
export const TM_PREFIX = "tm:v5";
export const VALUE_TM_PREFIX = "tm:v5:val";
export const MAX_VALUE_CACHE_CHARS = 300;

export const DEFAULT_TM_MODEL = "gpt-4.1-nano";

/** worker TM 常见模型（与翻译任务 aiModel / 路由引擎对齐）。 */
export const COMMON_TM_MODELS = [
  "gpt-4.1-nano",
  "gpt-4.1-mini",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "google-translate",
  "deepseek-chat",
  "deepseek-reasoner",
] as const;

/** 按店铺浏览时的 SCAN pattern；有 target 时收窄范围。 */
export function tmBrowseScanPattern(shop: string, target?: string): string {
  if (target?.trim()) {
    return `${TM_PREFIX}:${shop}:${target.trim()}:*`;
  }
  return `${TM_PREFIX}:${shop}:*`;
}

export function tmDigestKey(
  shopName: string,
  target: string,
  model: string,
  digest: string,
): string {
  return `${TM_PREFIX}:${shopName}:${target}:${model}:${digest}`;
}

export function tmValueKey(
  sourceText: string,
  source: string,
  target: string,
  model: string,
): string {
  return `${VALUE_TM_PREFIX}:${valueHash(sourceText, source, target, model)}`;
}

export function valueHash(
  sourceText: string,
  source: string,
  target: string,
  model: string,
): string {
  return createHash("sha256")
    .update(`${model}|${source}|${target}|${sourceText}`)
    .digest("hex")
    .slice(0, 32);
}

export type ParsedDigestTmKey = {
  shop: string;
  target: string;
  model: string;
  digest: string;
};

/** 解析 digest 型 TM key：`tm:v5:{shop}:{target}:{model}:{digest}` */
export function parseDigestTmKey(key: string): ParsedDigestTmKey | null {
  if (!key.startsWith(`${TM_PREFIX}:`) || key.startsWith(`${VALUE_TM_PREFIX}:`)) {
    return null;
  }
  const rest = key.slice(TM_PREFIX.length + 1);
  const parts = rest.split(":");
  if (parts.length < 4) return null;
  const [shop, target, model, ...digestParts] = parts;
  const digest = digestParts.join(":");
  if (!shop || !target || !model || !digest) return null;
  return { shop, target, model, digest };
}

export function previewText(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
