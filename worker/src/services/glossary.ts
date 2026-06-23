import { hasTsfDbCredentials, loadGlossaryRowsFromTsf } from "./tsfDb.js";

/**
 * Per-shop glossary injected into the translation system prompt so wording
 * stays consistent.
 *
 * Source of truth: TSF Prisma/Turso `Glossary` table (迁移自旧 Java 术语表)。
 * 适用范围过滤与 Java GlossaryService 一致：rangeCode == target 或 "ALL"。
 *
 * 产出的行做了确定性排序，使系统提示词前缀字节稳定 → 命中 LLM 的 prompt 缓存。
 */

export type GlossaryTerm = {
  source: string;
  translations?: Record<string, string>;
  doNotTranslate?: boolean;
  note?: string;
};

type CacheEntry = {
  lines: string[];
  expiresAt: number;
};
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

/**
 * 返回某店 + target 语言的术语表指令行（从 TSF Turso 读）。
 * 无术语表或 TSF 未配置时返回空数组。进程内缓存 5 分钟。永不抛错。
 */
export async function loadGlossaryLines(shopName: string, target: string): Promise<string[]> {
  const cacheKey = `${shopName}::${target}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.lines;

  let lines: string[] = [];
  try {
    if (hasTsfDbCredentials()) {
      const rows = await loadGlossaryRowsFromTsf(shopName, target);
      lines = rows
        .filter((r) => r.sourceText && r.targetText)
        .map((r) => `- Translate "${r.sourceText}" as "${r.targetText}".`)
        // 去重 + 确定性排序，保持系统提示词前缀字节稳定（利于 prompt 缓存）。
        .filter((line, i, arr) => arr.indexOf(line) === i)
        .sort();
    }
  } catch (err) {
    console.error(`[glossary] 读取 TSF 术语表失败 shop=${shopName}:`, err);
    lines = [];
  }

  cache.set(cacheKey, { lines, expiresAt: now + TTL_MS });
  return lines;
}

/** @internal test helper to reset the in-memory cache. */
export function __clearGlossaryCache(): void {
  cache.clear();
}
