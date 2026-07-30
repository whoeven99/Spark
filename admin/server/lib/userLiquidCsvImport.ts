import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { decodeCsvBuffer, parseCsvText } from "./queryCsvImport.js";
import { normalizeShopName } from "./shopSession.js";

export const USER_LIQUID_MAX_TEXT_LEN = 1000;

const REQUIRED_COLUMN_ALIASES = {
  sourceText: ["sourceText", "source_text", "liquid_before_translation"],
  languageCode: ["languageCode", "language_code"],
  targetText: ["targetText", "target_text", "liquid_after_translation"],
} as const;

export type ParsedLiquidRuleRow = {
  shop: string;
  beforeTranslation: string;
  afterTranslation: string;
  languageCode: string;
  replacementMethod: boolean;
  truncated: boolean;
  rowIdx: number;
};

export type LiquidRuleDedupeKey = [string, string, string];

function csvGet(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val != null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return "";
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "t";
}

export function liquidRuleDedupeKey(
  shop: string,
  beforeText: string,
  languageCode: string,
): LiquidRuleDedupeKey {
  return [shop.slice(0, 255), beforeText, languageCode];
}

export function parseReplacementMethod(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === "") return false;
  return isTruthy(value);
}

export function normalizeLiquidRuleCsvRow(
  row: Record<string, string>,
  defaultShop: string,
): { record: ParsedLiquidRuleRow | null; skipReason: string | null } {
  const shop = defaultShop.slice(0, 255);
  const languageCode = csvGet(row, ...REQUIRED_COLUMN_ALIASES.languageCode).slice(0, 10);
  if (!languageCode) {
    return { record: null, skipReason: "languageCode 为空" };
  }

  let beforeTranslation = csvGet(row, ...REQUIRED_COLUMN_ALIASES.sourceText);
  let afterTranslation = csvGet(row, ...REQUIRED_COLUMN_ALIASES.targetText);
  if (!beforeTranslation && !afterTranslation) {
    return { record: null, skipReason: "sourceText/targetText 均为空" };
  }

  let truncated = false;
  if (beforeTranslation.length > USER_LIQUID_MAX_TEXT_LEN) {
    beforeTranslation = beforeTranslation.slice(0, USER_LIQUID_MAX_TEXT_LEN);
    truncated = true;
  }
  if (afterTranslation.length > USER_LIQUID_MAX_TEXT_LEN) {
    afterTranslation = afterTranslation.slice(0, USER_LIQUID_MAX_TEXT_LEN);
    truncated = true;
  }

  const replacementMethod = parseReplacementMethod(
    csvGet(row, "replacementMethod", "replacement_method") || null,
  );

  return {
    record: {
      shop,
      beforeTranslation,
      afterTranslation,
      languageCode,
      replacementMethod,
      truncated,
      rowIdx: 0,
    },
    skipReason: null,
  };
}

export function assertLiquidRuleCsvColumns(headers: string[]): string[] {
  const missing: string[] = [];
  for (const [label, aliases] of Object.entries(REQUIRED_COLUMN_ALIASES)) {
    if (!aliases.some((a) => headers.includes(a))) {
      missing.push(label);
    }
  }
  return missing;
}

export function findFileDuplicateKeys(
  records: ParsedLiquidRuleRow[],
): LiquidRuleDedupeKey[] {
  const seen = new Map<string, LiquidRuleDedupeKey>();
  const dupKeys: LiquidRuleDedupeKey[] = [];

  for (const rec of records) {
    const key = liquidRuleDedupeKey(rec.shop, rec.beforeTranslation, rec.languageCode);
    const serialized = JSON.stringify(key);
    if (seen.has(serialized)) {
      if (!dupKeys.some((k) => JSON.stringify(k) === serialized)) {
        dupKeys.push(key);
      }
    } else {
      seen.set(serialized, key);
    }
  }
  return dupKeys;
}

export async function loadExistingLiquidRuleKeys(
  db: Client,
  shop: string,
): Promise<Set<string>> {
  const result = await db.execute({
    sql: `SELECT languageCode, beforeTranslation FROM LiquidRule WHERE shop = ?`,
    args: [shop],
  });

  const keys = new Set<string>();
  for (const row of result.rows) {
    const lang = row.languageCode != null ? String(row.languageCode) : "";
    const before = row.beforeTranslation != null ? String(row.beforeTranslation) : "";
    const key = liquidRuleDedupeKey(shop, before, lang);
    keys.add(JSON.stringify(key));
  }
  return keys;
}

export function parseLiquidRuleCsvBuffer(
  buffer: Buffer,
  shopName: string,
): {
  rows: Record<string, string>[];
  missingColumns: string[];
} {
  const shop = normalizeShopName(shopName);
  const decoded = decodeCsvBuffer(buffer);
  const rows = parseCsvText(decoded);
  if (!rows.length) {
    return { rows: [], missingColumns: [] };
  }
  const headers = Object.keys(rows[0] ?? {});
  const missingColumns = assertLiquidRuleCsvColumns(headers);
  return { rows, missingColumns };
}

export type LiquidRuleImportPlan = {
  shop: string;
  totalRows: number;
  skipInvalidCount: number;
  skipDbCount: number;
  truncateCount: number;
  toInsert: ParsedLiquidRuleRow[];
  fileDuplicateKeys: LiquidRuleDedupeKey[];
};

export function buildLiquidRuleImportPlan(
  rawRows: Record<string, string>[],
  shopName: string,
  existingKeySet: Set<string>,
): LiquidRuleImportPlan {
  const shop = normalizeShopName(shopName);
  const parsedRecords: ParsedLiquidRuleRow[] = [];
  let skipInvalidCount = 0;
  let truncateCount = 0;

  rawRows.forEach((row, index) => {
    const { record, skipReason } = normalizeLiquidRuleCsvRow(row, shop);
    if (!record) {
      skipInvalidCount += 1;
      void skipReason;
      return;
    }
    if (record.truncated) truncateCount += 1;
    record.rowIdx = index + 1;
    parsedRecords.push(record);
  });

  const fileDuplicateKeys = findFileDuplicateKeys(parsedRecords);
  if (fileDuplicateKeys.length > 0) {
    return {
      shop,
      totalRows: rawRows.length,
      skipInvalidCount,
      skipDbCount: 0,
      truncateCount,
      toInsert: [],
      fileDuplicateKeys,
    };
  }

  let skipDbCount = 0;
  const toInsert: ParsedLiquidRuleRow[] = [];
  const workingKeys = new Set(existingKeySet);

  for (const rec of parsedRecords) {
    const key = liquidRuleDedupeKey(rec.shop, rec.beforeTranslation, rec.languageCode);
    const serialized = JSON.stringify(key);
    if (workingKeys.has(serialized)) {
      skipDbCount += 1;
      continue;
    }
    toInsert.push(rec);
    workingKeys.add(serialized);
  }

  return {
    shop,
    totalRows: rawRows.length,
    skipInvalidCount,
    skipDbCount,
    truncateCount,
    toInsert,
    fileDuplicateKeys: [],
  };
}

export async function insertLiquidRules(
  db: Client,
  records: ParsedLiquidRuleRow[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    try {
      await db.execute({
        sql: `INSERT INTO LiquidRule (
                id, shop, beforeTranslation, afterTranslation,
                languageCode, replacementMethod, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          rec.shop,
          rec.beforeTranslation,
          rec.afterTranslation,
          rec.languageCode,
          rec.replacementMethod ? 1 : 0,
          now,
          now,
        ],
      });
      successCount += 1;
      if (successCount % 100 === 0) {
        onProgress?.(successCount, records.length);
      }
    } catch (e) {
      failCount += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`行 ${rec.rowIdx} 插入失败: ${msg}`);
    }
  }

  onProgress?.(successCount, records.length);
  return { successCount, failCount, errors };
}

export function formatLiquidRuleImportSummary(plan: LiquidRuleImportPlan, result: {
  successCount: number;
  failCount: number;
}): string {
  let summary = (
    `导入完成。成功: ${result.successCount}, 失败: ${result.failCount}, ` +
    `跳过无效: ${plan.skipInvalidCount}, 跳过库中已存在: ${plan.skipDbCount}`
  );
  if (plan.truncateCount > 0) {
    summary += `, 截断超长字段: ${plan.truncateCount} 行`;
  }
  return summary;
}
