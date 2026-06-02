/**
 * Export a translation quality report for one or more v4 tasks.
 *
 * Reads the translate-stage blobs (original + translated values) produced by the
 * pipeline, runs the analyzer, prints a summary, and writes the full JSON report
 * to disk for review.
 *
 * Usage:
 *   tsx src/scripts/exportTranslationReport.ts <shopName> <taskId> [outDir]
 *
 * Writes into <outDir> (default ./translation-reports/<shop>-<taskId>/ — all
 * reports live under the single gitignored `translation-reports/` folder):
 *   - report.json        aggregate inventory + full-coverage quality flags
 *   - <MODULE>.jsonl      EVERY before/after entry for that module (one per line)
 *
 * Requires the same Blob env as the worker (BLOB_TRANSLATE_V3_CONNECTION_STRING
 * or AZURE_BLOB_CONNECTION_STRING, AZURE_BLOB_TRANSLATION_CONTAINER).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { blobRead, blobListPaths } from "../services/blobV4.js";
import { analyzeTranslations, type ReportEntry } from "../services/translationReport.js";

type TranslateChunk = Array<{
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest: string;
    status?: "translated" | "fallback";
  }>;
}>;

function moduleFromPath(path: string): string | null {
  // tasks/v4/{shop}/{taskId}/translate/{MODULE}/chunk-00.json
  const parts = path.split("/");
  const idx = parts.indexOf("translate");
  if (idx < 0 || idx + 2 >= parts.length) return null; // need /translate/{MODULE}/file
  return parts[idx + 1];
}

async function collectEntries(shopName: string, taskId: string): Promise<ReportEntry[]> {
  const blobPrefix = `tasks/v4/${shopName}/${taskId}`;
  const paths = (await blobListPaths(`${blobPrefix}/translate/`)).filter((p) => p.endsWith(".json"));

  const entries: ReportEntry[] = [];
  for (const path of paths) {
    const module = moduleFromPath(path);
    if (!module) continue; // skips translate/fallbacks.json
    const chunk = await blobRead<TranslateChunk>(path);
    if (!chunk) continue;
    for (const resource of chunk) {
      for (const t of resource.translations ?? []) {
        entries.push({
          module,
          resourceId: resource.resourceId,
          key: t.key,
          original: t.originalValue ?? "",
          translated: t.translatedValue ?? "",
          status: t.status ?? "translated",
        });
      }
    }
  }
  return entries;
}

async function main(): Promise<void> {
  const [shopName, taskId, outArg] = process.argv.slice(2);
  if (!shopName || !taskId) {
    console.error("Usage: tsx src/scripts/exportTranslationReport.ts <shopName> <taskId> [outPath]");
    process.exit(1);
  }

  console.log(`[report] reading translate blobs for shop=${shopName} task=${taskId}`);
  const entries = await collectEntries(shopName, taskId);
  if (entries.length === 0) {
    console.error("[report] no translate entries found — check shopName/taskId and Blob env");
    process.exit(2);
  }

  const report = analyzeTranslations(entries);
  // All reports live under one gitignored folder for easy cleanup.
  const outDir = outArg || join("translation-reports", `${shopName}-${taskId}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");

  // Full per-module dump: every before/after entry, one JSON per line. No sampling.
  const byModule = new Map<string, ReportEntry[]>();
  for (const e of entries) {
    const list = byModule.get(e.module) ?? [];
    list.push(e);
    byModule.set(e.module, list);
  }
  for (const [module, list] of byModule) {
    const jsonl = list.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(join(outDir, `${module}.jsonl`), jsonl, "utf8");
  }

  // Console summary
  const { totals } = report;
  console.log("\n=== Translation Quality Report ===");
  console.log(`shop=${shopName} task=${taskId}`);
  console.log(`resources=${totals.resources} fields=${totals.fields}`);
  console.log(`fallback=${totals.fallback} unchanged=${totals.unchanged} empty=${totals.empty} flagged=${totals.flagged}`);
  console.log("\n-- Field inventory by module --");
  for (const [module, mod] of Object.entries(report.modules)) {
    console.log(`\n[${module}] resources=${mod.resources} fields=${mod.fields}`);
    const rows = Object.values(mod.keys).sort((a, b) => b.count - a.count);
    for (const s of rows) {
      console.log(
        `  ${s.key.padEnd(28)} ${s.klass.padEnd(5)} n=${String(s.count).padStart(5)} ` +
          `len ${s.avgOriginalLen}->${s.avgTranslatedLen} fb=${s.fallback} unch=${s.unchanged} empty=${s.empty}`,
      );
    }
  }
  console.log(`\nReport dir: ${outDir}/  (report.json + per-module .jsonl with all ${totals.fields} entries)`);
}

main().catch((e) => {
  console.error("[report] failed", e);
  process.exit(1);
});
