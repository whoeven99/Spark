import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(resolve(__dir, "../.env"), "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("="); if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) continue;
    env[k] = line.slice(eq + 1).trim();
  }
} catch {}
const CONN = process.env.AZURE_BLOB_CONNECTION_STRING ?? env.AZURE_BLOB_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_BLOB_TRANSLATION_CONTAINER ?? env.AZURE_BLOB_TRANSLATION_CONTAINER ?? "translation-content";
const container = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
process.on("unhandledRejection", (e) => { console.error("[warn] swallowed:", e?.message); });

const jobId = process.argv[2];
const SKIP_KEYS = new Set(["handle"]);
const hasCJK = (s) => /[一-鿿㐀-䶿]/.test(String(s || ""));

// find job prefix
let shop = null;
for await (const b of container.listBlobsFlat({ prefix: "tasks/v4/" })) {
  const p = b.name.split("/");
  if (p[3] === jobId) { shop = p[2]; break; }
}
if (!shop) { console.error("job not found"); process.exit(1); }
const base = `tasks/v4/${shop}/${jobId}/translate/`;

const stats = {};
const overTrans = [];
let total = 0, noSrc = 0, needTranslate = 0, toTarget = 0, fallback = 0, unchanged = 0, notYet = 0;

const names = [];
for await (const b of container.listBlobsFlat({ prefix: base })) {
  if (!b.name.endsWith(".json") || b.name.endsWith("fallbacks.json")) continue;
  names.push(b.name);
}
for (const name of names) {
  const b = { name };
  const mod = b.name.split("/").slice(-2)[0];
  let data = null;
  for (let attempt = 0; attempt < 3 && !data; attempt++) {
    try {
      const buf = await container.getBlobClient(b.name).downloadToBuffer();
      data = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      if (attempt === 2) { console.error(`skip ${b.name}: ${e.message}`); }
    }
  }
  if (!data) continue;
  const s = stats[mod] || (stats[mod] = { total:0, noSrc:0, need:0, toTarget:0, fb:0, unch:0 });
  for (const r of data) {
    for (const t of (r.translations ?? [])) {
      if (SKIP_KEYS.has(t.key)) continue;
      const orig = t.originalValue ?? "";
      const tr = t.translatedValue ?? "";
      total++; s.total++;
      if (!hasCJK(orig)) { noSrc++; s.noSrc++; }
      else {
        needTranslate++; s.need++;
        if (!hasCJK(tr)) { toTarget++; s.toTarget++; }
      }
      if (t.status === "fallback") { fallback++; s.fb++; }
      if (tr && tr === orig) { unchanged++; s.unch++; }
      if (!tr) notYet++;
      // over-translation: CSS/layout enum translated in metafield-ish JSON value
      if (mod === "METAFIELD") {
        for (const enumv of ["center","left","right","flex","space-between","bottom_right","bottom-right","top_left"]) {
          if (orig.includes(`"${enumv}"`) && !tr.includes(`"${enumv}"`) && overTrans.length < 25) {
            overTrans.push(`${r.resourceId} key=${t.key} enum="${enumv}" missing in translation`);
            break;
          }
        }
      }
    }
  }
}

console.log("=== OVERALL ===");
console.log(`total fields (non-skip): ${total}`);
console.log(`noSrc (orig no CJK): ${noSrc}  (${(100*noSrc/total).toFixed(1)}%)  <- token waste candidates`);
console.log(`needTranslate (orig has CJK): ${needTranslate}`);
console.log(`toTarget (translated, CJK removed): ${toTarget}  (${needTranslate?(100*toTarget/needTranslate).toFixed(1):'-'}% of need)`);
console.log(`fallback: ${fallback}  (${(100*fallback/total).toFixed(1)}%)`);
console.log(`unchanged (tr===orig): ${unchanged}  (${(100*unchanged/total).toFixed(1)}%)`);
console.log(`not yet translated (empty tr): ${notYet}`);
console.log("\n=== PER MODULE (total / noSrc / need / toTarget / fallback / unchanged) ===");
for (const [m, s] of Object.entries(stats).sort((a,b)=>b[1].total-a[1].total)) {
  console.log(`${m.padEnd(38)} ${String(s.total).padStart(5)} | noSrc ${String(s.noSrc).padStart(5)} (${(100*s.noSrc/s.total).toFixed(0)}%) | need ${String(s.need).padStart(5)} | toTgt ${String(s.toTarget).padStart(5)} | fb ${s.fb} | unch ${s.unch}`);
}
console.log("\n=== METAFIELD enum over-translation candidates ===");
overTrans.forEach(x => console.log("  " + x));
if (!overTrans.length) console.log("  (none detected by heuristic)");
