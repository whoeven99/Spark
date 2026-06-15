import { classifyField } from "./llmTranslate.js";

/** One translated field, flattened from a translate-chunk blob. */
export type ReportEntry = {
  module: string;
  resourceId: string;
  key: string;
  original: string;
  translated: string;
  status: "translated" | "fallback";
};

export type FieldStat = {
  key: string;
  klass: "skip" | "html" | "json" | "plain";
  count: number;
  fallback: number;
  /** translated === original (excluding skip fields), i.e. suspected not-translated */
  unchanged: number;
  /** translated is empty but original was not */
  empty: number;
  avgOriginalLen: number;
  avgTranslatedLen: number;
};

export type QualityFlag = {
  module: string;
  resourceId: string;
  key: string;
  reason: "fallback" | "unchanged" | "empty" | "length-ratio" | "html-tag-mismatch" | "placeholder-loss";
  detail: string;
};

export type TranslationReport = {
  totals: {
    resources: number;
    fields: number;
    fallback: number;
    unchanged: number;
    empty: number;
    flagged: number;
  };
  modules: Record<string, { resources: number; fields: number; keys: Record<string, FieldStat> }>;
  flags: QualityFlag[];
  samples: ReportEntry[];
};

const PLACEHOLDER_RE = /\{\{.*?\}\}|%[sd]|\{\d+\}|\$\{.*?\}/g;
const TAG_RE = /<[^>]+>/g;

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

/**
 * Aggregate translate-chunk entries into a field inventory + quality flags.
 * Pure and deterministic so it can be unit-tested without Blob access.
 */
export function analyzeTranslations(entries: ReportEntry[], samplePerClass = 5): TranslationReport {
  const modules: TranslationReport["modules"] = {};
  const flags: QualityFlag[] = [];
  const resourceSet = new Set<string>();
  const moduleResourceSets: Record<string, Set<string>> = {};

  // Running sums to compute averages without storing every length.
  const lenSums = new Map<string, { o: number; t: number }>();

  let fallback = 0;
  let unchanged = 0;
  let empty = 0;

  for (const e of entries) {
    const klass = classifyField(e.key, e.original);
    resourceSet.add(`${e.module}::${e.resourceId}`);

    const mod = (modules[e.module] ??= { resources: 0, fields: 0, keys: {} });
    (moduleResourceSets[e.module] ??= new Set()).add(e.resourceId);
    mod.fields++;

    const stat = (mod.keys[e.key] ??= {
      key: e.key,
      klass,
      count: 0,
      fallback: 0,
      unchanged: 0,
      empty: 0,
      avgOriginalLen: 0,
      avgTranslatedLen: 0,
    });
    stat.count++;

    const sums = lenSums.get(`${e.module}::${e.key}`) ?? { o: 0, t: 0 };
    sums.o += e.original.length;
    sums.t += e.translated.length;
    lenSums.set(`${e.module}::${e.key}`, sums);

    const o = e.original.trim();
    const t = e.translated.trim();

    if (e.status === "fallback") {
      fallback++;
      stat.fallback++;
      flags.push({ module: e.module, resourceId: e.resourceId, key: e.key, reason: "fallback", detail: "engine fell back to original" });
    }
    if (klass !== "skip" && o !== "" && t === o) {
      unchanged++;
      stat.unchanged++;
      flags.push({ module: e.module, resourceId: e.resourceId, key: e.key, reason: "unchanged", detail: "translated equals original" });
    }
    if (o !== "" && t === "") {
      empty++;
      stat.empty++;
      flags.push({ module: e.module, resourceId: e.resourceId, key: e.key, reason: "empty", detail: "translated is empty" });
    }
    if (klass === "plain" && o.length >= 20) {
      const ratio = t.length / o.length;
      if (ratio < 0.3 || ratio > 3) {
        flags.push({
          module: e.module,
          resourceId: e.resourceId,
          key: e.key,
          reason: "length-ratio",
          detail: `len ${o.length}→${t.length} (ratio ${ratio.toFixed(2)})`,
        });
      }
    }
    if (klass === "html") {
      const od = countMatches(e.original, TAG_RE);
      const td = countMatches(e.translated, TAG_RE);
      if (od !== td) {
        flags.push({ module: e.module, resourceId: e.resourceId, key: e.key, reason: "html-tag-mismatch", detail: `tags ${od}→${td}` });
      }
    }
    const op = countMatches(e.original, PLACEHOLDER_RE);
    const tp = countMatches(e.translated, PLACEHOLDER_RE);
    if (op > tp) {
      flags.push({ module: e.module, resourceId: e.resourceId, key: e.key, reason: "placeholder-loss", detail: `placeholders ${op}→${tp}` });
    }
  }

  // Finalize averages and per-module resource counts.
  for (const [module, mod] of Object.entries(modules)) {
    mod.resources = moduleResourceSets[module]?.size ?? 0;
    for (const stat of Object.values(mod.keys)) {
      const sums = lenSums.get(`${module}::${stat.key}`) ?? { o: 0, t: 0 };
      stat.avgOriginalLen = Math.round(sums.o / stat.count);
      stat.avgTranslatedLen = Math.round(sums.t / stat.count);
    }
  }

  // Sample up to N entries per class for human/LLM review.
  const samples: ReportEntry[] = [];
  const perClass: Record<string, number> = { skip: 0, html: 0, plain: 0 };
  for (const e of entries) {
    const klass = classifyField(e.key, e.original);
    if (perClass[klass] < samplePerClass) {
      samples.push(e);
      perClass[klass]++;
    }
  }

  return {
    totals: {
      resources: resourceSet.size,
      fields: entries.length,
      fallback,
      unchanged,
      empty,
      flagged: flags.length,
    },
    modules,
    flags,
    samples,
  };
}
