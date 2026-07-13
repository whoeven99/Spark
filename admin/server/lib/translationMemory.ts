/**
 * 与 TSF `packages/translation-core/src/translationMemory.ts` 对齐。
 *
 * 两层 TM：
 * 1. digest 主缓存：`tm:v5:{shop}:{target}:{model}:{digest}`（按店）
 * 2. value 二级缓存：`tm:v5:val:{source}:{target}:{model}:{keyId}`（跨店）
 *    keyId = Shopify digest（优先）或原文 CRC-32（8 位 hex）
 */
export const TM_PREFIX = "tm:v5";
export const VALUE_TM_PREFIX = "tm:v5:val";

/** 产品规则文档阈值（长短文均走 digest ?? CRC-32，Admin 查询不据此拒绝）。 */
export const VALUE_CACHE_THRESHOLD = 200;

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

/** IEEE CRC-32 → 8-char lowercase hex（与 TSF translation-core 一致）。 */
export function crc32Hex(text: string): string {
  let crc = 0xffffffff;
  const buf = Buffer.from(text, "utf8");
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/** 优先 Shopify digest；否则 CRC-32。 */
export function valueCacheKeyId(sourceText: string, digest?: string): string {
  const d = digest?.trim();
  if (d) return d;
  return crc32Hex(sourceText);
}

/** Value TM key：`tm:v5:val:{source}:{target}:{model}:{digest|crc32}` */
export function tmValueKey(
  sourceText: string,
  source: string,
  target: string,
  model: string,
  digest?: string,
): string {
  return `${VALUE_TM_PREFIX}:${source}:${target}:${model}:${valueCacheKeyId(sourceText, digest)}`;
}

export type ParsedDigestTmKey = {
  shop: string;
  target: string;
  model: string;
  digest: string;
};

export type ParsedValueTmKey = {
  source: string;
  target: string;
  model: string;
  keyId: string;
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

/** 解析 value 型 TM key：`tm:v5:val:{source}:{target}:{model}:{keyId}` */
export function parseValueTmKey(key: string): ParsedValueTmKey | null {
  if (!key.startsWith(`${VALUE_TM_PREFIX}:`)) return null;
  const rest = key.slice(VALUE_TM_PREFIX.length + 1);
  const parts = rest.split(":");
  if (parts.length < 4) return null;
  const [source, target, model, ...keyIdParts] = parts;
  const keyId = keyIdParts.join(":");
  if (!source || !target || !model || !keyId) return null;
  return { source, target, model, keyId };
}

/** CRC-32 keyId 为 8 位小写 hex；Shopify digest 通常更长。 */
export function isCrc32KeyId(keyId: string): boolean {
  return /^[0-9a-f]{8}$/i.test(keyId.trim());
}

/** value 缓存 SCAN pattern；可按 source / target / model 收窄。 */
export function tmValueBrowseScanPattern(opts: {
  source?: string;
  target?: string;
  model?: string;
}): string {
  const source = opts.source?.trim();
  const target = opts.target?.trim();
  const model = opts.model?.trim();
  if (source && target && model) {
    return `${VALUE_TM_PREFIX}:${source}:${target}:${model}:*`;
  }
  if (source && target) {
    return `${VALUE_TM_PREFIX}:${source}:${target}:*`;
  }
  if (source) {
    return `${VALUE_TM_PREFIX}:${source}:*`;
  }
  return `${VALUE_TM_PREFIX}:*`;
}

export function previewText(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
