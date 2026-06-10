/**
 * Admin API for glossary management.
 *
 * GET    /:shopName          — read live glossary from Blob
 * PUT    /:shopName          — overwrite live glossary + bump Redis version
 * POST   /:shopName/import   — bulk CSV import (wide format, merge or replace)
 * POST   /:shopName/parse    — file upload → LLM extraction → return terms (NOT saved)
 */

import { Router } from "express";
import multer from "multer";
import { blobRead, blobWrite, isBlobConfigured } from "../lib/blob.js";
import { getRedis } from "../lib/redis.js";
import { extractFileText } from "../lib/fileExtract.js";
import { parseGlossaryWithLLM } from "../lib/llmGlossary.js";

export const glossaryRouter = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export type GlossaryTerm = {
  source: string;
  doNotTranslate?: boolean;
  note?: string;
  translations?: Record<string, string>;
};

type GlossaryFile = {
  terms: GlossaryTerm[];
  updatedAt?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function blobPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

async function bumpGlossaryVersion(shopName: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`translate:v4:glossary_v:${shopName}`, Date.now().toString(), "EX", 7 * 86400);
  } catch { /* best-effort */ }
}

function mergeTerms(existing: GlossaryTerm[], incoming: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const inc of incoming) {
    const ex = map.get(inc.source);
    if (!ex) { map.set(inc.source, inc); continue; }
    if (inc.translations) ex.translations = { ...inc.translations, ...ex.translations };
    if (!ex.note && inc.note) ex.note = inc.note;
    if (inc.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}

// Wide-format CSV: source, do_not_translate, note, en, zh-CN, pl, ...
function parseCsv(csv: string): GlossaryTerm[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const srcIdx  = headers.indexOf("source");
  const dntIdx  = headers.indexOf("do_not_translate");
  const noteIdx = headers.indexOf("note");
  if (srcIdx === -1) return [];

  const localeHeaders = headers.map((h, i) => {
    if (i === srcIdx || i === dntIdx || i === noteIdx) return null;
    return h; // treat everything else as a locale code
  });

  const terms: GlossaryTerm[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const source = (cols[srcIdx] ?? "").trim();
    if (!source) continue;

    const dnt = (cols[dntIdx] ?? "").trim().toLowerCase();
    const note = (cols[noteIdx] ?? "").trim() || undefined;

    const translations: Record<string, string> = {};
    for (let j = 0; j < localeHeaders.length; j++) {
      const locale = localeHeaders[j];
      if (!locale) continue;
      const val = (cols[j] ?? "").trim();
      if (val) translations[locale] = val;
    }

    terms.push({
      source,
      doNotTranslate: dnt === "true" || dnt === "1" || dnt === "yes",
      note,
      translations: Object.keys(translations).length ? translations : undefined,
    });
  }
  return terms;
}

function splitCsvRow(row: string): string[] {
  const cols: string[] = [];
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuote && row[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      cols.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

// ── Multer for file upload ────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── GET /:shopName ────────────────────────────────────────────────────────────

glossaryRouter.get("/:shopName", async (req, res) => {
  if (!isBlobConfigured()) {
    res.json({ terms: [], note: "Blob storage not configured" });
    return;
  }
  try {
    const file = await blobRead<GlossaryFile>(blobPath(req.params.shopName));
    res.json({ terms: file?.terms ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── PUT /:shopName ────────────────────────────────────────────────────────────

glossaryRouter.put("/:shopName", async (req, res) => {
  if (!isBlobConfigured()) { res.status(503).json({ error: "Blob not configured" }); return; }

  const terms = req.body?.terms;
  if (!Array.isArray(terms)) {
    res.status(400).json({ error: "Body must be { terms: GlossaryTerm[] }" });
    return;
  }

  try {
    const file: GlossaryFile = { terms: terms as GlossaryTerm[], updatedAt: new Date().toISOString() };
    await blobWrite(blobPath(req.params.shopName), file);
    await bumpGlossaryVersion(req.params.shopName);
    res.json({ ok: true, total: terms.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /:shopName/import ────────────────────────────────────────────────────

glossaryRouter.post("/:shopName/import", async (req, res) => {
  if (!isBlobConfigured()) { res.status(503).json({ error: "Blob not configured" }); return; }

  const { csv, mode } = req.body ?? {};
  if (typeof csv !== "string" || !csv.trim()) {
    res.status(400).json({ error: "Body must have { csv: string, mode?: 'merge'|'replace' }" });
    return;
  }

  const mergeMode: "merge" | "replace" = mode === "replace" ? "replace" : "merge";
  const incoming = parseCsv(csv);
  if (!incoming.length) {
    res.status(400).json({ error: "No valid rows found in CSV" });
    return;
  }

  try {
    let finalTerms: GlossaryTerm[];
    if (mergeMode === "replace") {
      finalTerms = incoming;
    } else {
      const existing = await blobRead<GlossaryFile>(blobPath(req.params.shopName));
      finalTerms = mergeTerms(existing?.terms ?? [], incoming);
    }
    await blobWrite(blobPath(req.params.shopName), { terms: finalTerms, updatedAt: new Date().toISOString() });
    await bumpGlossaryVersion(req.params.shopName);
    res.json({ ok: true, total: finalTerms.length, mode: mergeMode });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /:shopName/parse ─────────────────────────────────────────────────────
// Upload file → extract text → LLM extraction → return terms (NOT saved yet)

glossaryRouter.post("/:shopName/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const { text, truncated } = await extractFileText(req.file.buffer, req.file.originalname);
    const terms = await parseGlossaryWithLLM(text);
    res.json({ terms, truncated });
  } catch (err) {
    console.error("[glossary/parse]", err);
    res.status(500).json({ error: String(err) });
  }
});
