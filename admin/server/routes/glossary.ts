import { Router } from "express";
import multer from "multer";
import { blobRead, blobWrite, isBlobConfigured } from "../lib/blob.js";
import { getRedis } from "../lib/redis.js";
import { extractFileText } from "../lib/fileExtract.js";
import { parseGlossaryWithLLM } from "../lib/llmGlossary.js";

// File uploads are held in memory — glossary files are small (<10 MB is plenty)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const glossaryRouter = Router();

// ── Types (mirror worker/src/services/glossary.ts) ───────────────────────────

export type GlossaryTerm = {
  source: string;
  translations?: Record<string, string>;
  doNotTranslate?: boolean;
  note?: string;
};

type GlossaryFile = { terms: GlossaryTerm[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function glossaryBlobPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

/** Bump the Redis version key so the translate worker busts its in-process cache. */
async function bumpGlossaryVersion(shopName: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`translate:v4:glossary_v:${shopName}`, Date.now().toString(), "EX", 7 * 86400);
  } catch {
    // best-effort — worker will pick up new glossary within its 5-min TTL at worst
  }
}

function validateTerms(terms: unknown): GlossaryTerm[] {
  if (!Array.isArray(terms)) throw new Error("terms must be an array");
  return terms.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`term[${i}] must be an object`);
    const term = t as Record<string, unknown>;
    if (typeof term.source !== "string" || !term.source.trim())
      throw new Error(`term[${i}].source must be a non-empty string`);
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

// ── GET /:shopName ─────────────────────────────────────────────────────────────

glossaryRouter.get("/:shopName", async (req, res) => {
  if (!isBlobConfigured()) {
    res.json({ terms: [], note: "Blob storage not configured" });
    return;
  }
  try {
    const file = await blobRead<GlossaryFile>(glossaryBlobPath(req.params.shopName));
    res.json({ terms: file?.terms ?? [] });
  } catch (err) {
    console.error("[glossary GET]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── PUT /:shopName ─────────────────────────────────────────────────────────────
// Full replace — body: { terms: GlossaryTerm[] }

glossaryRouter.put("/:shopName", async (req, res) => {
  if (!isBlobConfigured()) {
    res.status(503).json({ error: "Blob storage not configured" });
    return;
  }
  try {
    const terms = validateTerms(req.body?.terms);
    const file: GlossaryFile = { terms };
    await blobWrite(glossaryBlobPath(req.params.shopName), file);
    await bumpGlossaryVersion(req.params.shopName);
    res.json({ ok: true, count: terms.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// ── POST /:shopName/import  ────────────────────────────────────────────────────
// CSV bulk import.
// Body: { csv: string, mode: "merge" | "replace" }
//
// CSV format (first row = header, locale columns after note):
//   source, do_not_translate, note, en, zh-CN, pl, fr, ...
//
// Rows where source is blank are skipped.

glossaryRouter.post("/:shopName/import", async (req, res) => {
  if (!isBlobConfigured()) {
    res.status(503).json({ error: "Blob storage not configured" });
    return;
  }
  try {
    const csv: string = req.body?.csv ?? "";
    const mode: "merge" | "replace" = req.body?.mode === "replace" ? "replace" : "merge";

    const imported = parseCsv(csv);
    if (imported.length === 0) {
      res.status(400).json({ error: "CSV contains no valid rows" });
      return;
    }

    let finalTerms: GlossaryTerm[];
    if (mode === "replace") {
      finalTerms = imported;
    } else {
      // Merge: existing terms win on conflict, imported terms fill gaps and add new locales
      const existing = await blobRead<GlossaryFile>(glossaryBlobPath(req.params.shopName));
      finalTerms = mergeTerms(existing?.terms ?? [], imported);
    }

    await blobWrite(glossaryBlobPath(req.params.shopName), { terms: finalTerms });
    await bumpGlossaryVersion(req.params.shopName);
    res.json({ ok: true, imported: imported.length, total: finalTerms.length, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// ── POST /:shopName/parse ─────────────────────────────────────────────────────
// Upload a file (.xlsx / .docx / .pdf / .txt / .csv), extract text, call LLM,
// and return parsed terms for the frontend to preview & confirm.
// The terms are NOT saved here — the caller does a PUT after user confirmation.

glossaryRouter.post("/:shopName/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "请上传文件（file 字段）" });
    return;
  }
  try {
    const { text, truncated } = await extractFileText(req.file.buffer, req.file.originalname);
    const terms = await parseGlossaryWithLLM(text);
    res.json({
      terms,
      count: terms.length,
      source: req.file.originalname,
      truncated,
      note: truncated ? "文件超过 14000 字符，已截断，建议分批处理" : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("不支持") || msg.includes("为空") ? 400 : 500;
    console.error("[glossary/parse]", err);
    res.status(status).json({ error: msg });
  }
});

// ── CSV parser ─────────────────────────────────────────────────────────────────

function parseCsv(csv: string): GlossaryTerm[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const header = splitCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
  const srcIdx  = header.indexOf("source");
  const dntIdx  = header.indexOf("do_not_translate");
  const noteIdx = header.indexOf("note");

  if (srcIdx === -1) throw new Error('CSV header must contain a "source" column');

  // Remaining columns after the three fixed ones are locale codes
  const FIXED = new Set(["source", "do_not_translate", "note"]);
  const localeIndices: Array<{ locale: string; idx: number }> = header
    .map((h, i) => ({ locale: h, idx: i }))
    .filter(({ locale }) => !FIXED.has(locale) && locale);

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

/** Minimal CSV row splitter — handles double-quoted fields with commas inside. */
function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
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

// ── Merge logic ────────────────────────────────────────────────────────────────

function mergeTerms(existing: GlossaryTerm[], imported: GlossaryTerm[]): GlossaryTerm[] {
  // Build map from source → term (case-sensitive)
  const map = new Map<string, GlossaryTerm>(existing.map((t) => [t.source, { ...t }]));
  for (const imp of imported) {
    const ex = map.get(imp.source);
    if (!ex) {
      map.set(imp.source, imp);
    } else {
      // Merge translations: imported adds new locales, doesn't overwrite existing ones
      if (imp.translations) {
        ex.translations = { ...imp.translations, ...ex.translations }; // existing wins
      }
      // Only fill note / doNotTranslate if existing term lacks them
      if (!ex.note && imp.note) ex.note = imp.note;
      if (!ex.doNotTranslate && imp.doNotTranslate) ex.doNotTranslate = imp.doNotTranslate;
    }
  }
  return [...map.values()];
}
