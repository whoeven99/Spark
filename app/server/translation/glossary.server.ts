import {
  getTranslateV3BlobContainer,
  translateV3ReadTextFull,
} from "./translateBlobStore.server";
import { getTranslateRedisClient } from "./translateRedis.server";

/** Mirror worker/src/services/glossary.ts */
export type GlossaryTerm = {
  source: string;
  translations?: Record<string, string>;
  doNotTranslate?: boolean;
  note?: string;
};

export type GlossaryFile = {
  terms: GlossaryTerm[];
};

function glossaryBlobPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

export function isGlossaryBlobConfigured(): boolean {
  return Boolean(process.env.AZURE_BLOB_CONNECTION_STRING?.trim());
}

export async function readGlossary(shopName: string): Promise<GlossaryTerm[]> {
  if (!isGlossaryBlobConfigured()) return [];
  const raw = await translateV3ReadTextFull(glossaryBlobPath(shopName));
  if (!raw) return [];
  try {
    const file = JSON.parse(raw) as GlossaryFile;
    return file?.terms ?? [];
  } catch {
    return [];
  }
}

async function writeGlossary(shopName: string, terms: GlossaryTerm[]): Promise<void> {
  const container = await getTranslateV3BlobContainer();
  const text = JSON.stringify({ terms } satisfies GlossaryFile, null, 2);
  const client = container.getBlockBlobClient(glossaryBlobPath(shopName));
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

async function bumpGlossaryVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:glossary_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch {
    // best-effort — worker picks up within in-process TTL at worst
  }
}

export function validateGlossaryTerms(terms: unknown): GlossaryTerm[] {
  if (!Array.isArray(terms)) throw new Error("terms must be an array");
  return terms.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`term[${i}] must be an object`);
    const term = t as Record<string, unknown>;
    if (typeof term.source !== "string" || !term.source.trim()) {
      throw new Error(`term[${i}].source must be a non-empty string`);
    }
    const out: GlossaryTerm = { source: term.source.trim() };
    if (term.doNotTranslate) out.doNotTranslate = true;
    if (typeof term.note === "string" && term.note.trim()) out.note = term.note.trim();
    if (term.translations && typeof term.translations === "object" && !Array.isArray(term.translations)) {
      const trans: Record<string, string> = {};
      for (const [locale, val] of Object.entries(term.translations as Record<string, unknown>)) {
        if (typeof val === "string" && val.trim()) trans[locale.trim()] = val.trim();
      }
      if (Object.keys(trans).length) out.translations = trans;
    }
    return out;
  });
}

export async function saveGlossary(shopName: string, terms: GlossaryTerm[]): Promise<number> {
  if (!isGlossaryBlobConfigured()) {
    throw new Error("Blob 未配置：请设置 AZURE_BLOB_CONNECTION_STRING");
  }
  const validated = validateGlossaryTerms(terms);
  await writeGlossary(shopName, validated);
  await bumpGlossaryVersion(shopName);
  return validated.length;
}

export function mergeGlossaryTerms(existing: GlossaryTerm[], imported: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map<string, GlossaryTerm>(existing.map((t) => [t.source, { ...t }]));
  for (const imp of imported) {
    const ex = map.get(imp.source);
    if (!ex) {
      map.set(imp.source, imp);
      continue;
    }
    if (imp.translations) {
      ex.translations = { ...imp.translations, ...ex.translations };
    }
    if (!ex.note && imp.note) ex.note = imp.note;
    if (!ex.doNotTranslate && imp.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}

export function parseGlossaryCsv(csv: string): GlossaryTerm[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV 需包含表头行和至少一行数据");

  const header = splitCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
  const srcIdx = header.indexOf("source");
  const dntIdx = header.indexOf("do_not_translate");
  const noteIdx = header.indexOf("note");

  if (srcIdx === -1) throw new Error('CSV 表头必须包含 "source" 列');

  const fixed = new Set(["source", "do_not_translate", "note"]);
  const localeIndices: Array<{ locale: string; idx: number }> = header
    .map((h, i) => ({ locale: h, idx: i }))
    .filter(({ locale }) => !fixed.has(locale) && locale);

  const terms: GlossaryTerm[] = [];
  for (let row = 1; row < lines.length; row++) {
    const cells = splitCsvRow(lines[row]);
    const source = cells[srcIdx]?.trim();
    if (!source) continue;

    const term: GlossaryTerm = { source };
    if (dntIdx !== -1 && /^(1|true|yes)$/i.test(cells[dntIdx]?.trim() ?? "")) {
      term.doNotTranslate = true;
    }
    if (noteIdx !== -1 && cells[noteIdx]?.trim()) {
      term.note = cells[noteIdx].trim();
    }
    const trans: Record<string, string> = {};
    for (const { locale, idx } of localeIndices) {
      const v = cells[idx]?.trim();
      if (v) trans[locale] = v;
    }
    if (Object.keys(trans).length) term.translations = trans;
    terms.push(term);
  }
  return terms;
}

function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export async function importGlossaryCsv(
  shopName: string,
  csv: string,
  mode: "merge" | "replace",
): Promise<{ imported: number; total: number }> {
  const imported = parseGlossaryCsv(csv);
  if (!imported.length) throw new Error("CSV 中没有有效数据行");

  const finalTerms =
    mode === "replace" ? imported : mergeGlossaryTerms(await readGlossary(shopName), imported);

  await saveGlossary(shopName, finalTerms);
  return { imported: imported.length, total: finalTerms.length };
}
