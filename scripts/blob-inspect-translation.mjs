/**
 * blob-inspect-translation.mjs
 *
 * Inspect translation job blobs in Azure Blob Storage.
 *
 * Usage:
 *   node scripts/blob-inspect-translation.mjs                  # list all jobs
 *   node scripts/blob-inspect-translation.mjs <jobId>          # inspect latest job matching jobId prefix
 *   node scripts/blob-inspect-translation.mjs <jobId> <module> # inspect specific module (e.g. PRODUCT)
 *   node scripts/blob-inspect-translation.mjs <jobId> <module> <chunkIdx>  # specific chunk (0-based)
 *
 * Environment:
 *   AZURE_BLOB_CONNECTION_STRING  (read from .env automatically if dotenv is available)
 *   AZURE_BLOB_TRANSLATION_CONTAINER  (default: translation-content)
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Config — load .env manually (no dotenv dependency required)
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env");
const env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    env[key] = line.slice(eq + 1).trim();
  }
} catch { /* no .env — rely on process.env */ }

const CONN = process.env.AZURE_BLOB_CONNECTION_STRING ?? env.AZURE_BLOB_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_BLOB_TRANSLATION_CONTAINER ?? env.AZURE_BLOB_TRANSLATION_CONTAINER ?? "translation-content";

if (!CONN) {
  console.error("ERROR: AZURE_BLOB_CONNECTION_STRING not set in .env or environment.");
  process.exit(1);
}

const client = BlobServiceClient.fromConnectionString(CONN);
const container = client.getContainerClient(CONTAINER);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readBlob(path) {
  try {
    const buf = await container.getBlobClient(path).downloadToBuffer();
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

async function listJobs() {
  const jobs = new Map(); // key=shop/jobId -> {shop, jobId, blobs:[]}
  for await (const blob of container.listBlobsFlat({ prefix: "tasks/v4/" })) {
    const parts = blob.name.split("/");
    if (parts.length < 4) continue;
    const shop = parts[2];
    const jobId = parts[3];
    const key = `${shop}/${jobId}`;
    if (!jobs.has(key)) jobs.set(key, { shop, jobId, blobs: [], lastModified: blob.properties.lastModified });
    jobs.get(key).blobs.push(blob.name);
    // track most recent blob modification as job's "last active" time
    if (blob.properties.lastModified > jobs.get(key).lastModified) {
      jobs.get(key).lastModified = blob.properties.lastModified;
    }
  }
  return [...jobs.values()].sort((a, b) => b.lastModified - a.lastModified);
}

function printSep(label = "") {
  const line = "─".repeat(70);
  console.log(label ? `\n┌─ ${label} ${"─".repeat(Math.max(0, 66 - label.length))}` : line);
}

function truncate(str, max = 300) {
  if (!str) return "(empty)";
  const s = String(str);
  return s.length <= max ? s : s.slice(0, max) + `… [+${s.length - max} chars]`;
}

// ---------------------------------------------------------------------------
// Show all jobs
// ---------------------------------------------------------------------------
async function showJobs() {
  printSep("Translation Jobs");
  const jobs = await listJobs();
  if (!jobs.length) { console.log("No jobs found."); return; }
  for (const j of jobs) {
    const ts = j.lastModified?.toISOString().slice(0, 19).replace("T", " ") ?? "?";
    console.log(`  ${j.jobId}  shop=${j.shop}  blobs=${j.blobs.length}  updated=${ts}`);
  }
  console.log(`\nTotal: ${jobs.length} jobs`);
  console.log("\nUsage: node scripts/blob-inspect-translation.mjs <jobId> [MODULE] [chunkIdx]");
}

// ---------------------------------------------------------------------------
// Show manifest + summary of a job
// ---------------------------------------------------------------------------
async function showJobSummary(job) {
  printSep(`Job: ${job.jobId}`);
  console.log(`Shop:    ${job.shop}`);
  console.log(`Blobs:   ${job.blobs.length}`);

  const manifest = await readBlob(`tasks/v4/${job.shop}/${job.jobId}/manifest.json`);
  if (manifest) {
    console.log(`Source:  ${manifest.source}  →  Target: ${manifest.target}`);
    console.log(`Created: ${manifest.createdAt}`);
    printSep("Modules (from manifest)");
    for (const [mod, info] of Object.entries(manifest.modules ?? {})) {
      console.log(`  ${mod.padEnd(40)} items=${info.totalItems}  chunks=${info.chunks}`);
    }
  } else {
    console.log("(no manifest.json found)");
  }

  // List available translate chunks
  const translateBlobs = job.blobs.filter(b => b.includes("/translate/") && b.endsWith(".json") && !b.endsWith("fallbacks.json"));
  if (translateBlobs.length) {
    printSep("Available translate chunks");
    for (const b of translateBlobs) {
      const parts = b.split("/");
      const mod = parts[parts.length - 2];
      const chunk = parts[parts.length - 1];
      console.log(`  ${mod}/${chunk}`);
    }
  }

  // Fallbacks summary
  const fallbacks = await readBlob(`tasks/v4/${job.shop}/${job.jobId}/translate/fallbacks.json`);
  if (fallbacks?.length) {
    printSep("Fallbacks (translated but kept original value)");
    for (const f of fallbacks.slice(0, 10)) {
      console.log(`  ${f.module}  ${f.resourceId}  key=${f.key}`);
    }
    if (fallbacks.length > 10) console.log(`  … and ${fallbacks.length - 10} more`);
  }

  console.log("\nUsage: node scripts/blob-inspect-translation.mjs <jobId> <MODULE> [chunkIdx]");
}

// ---------------------------------------------------------------------------
// Show side-by-side before/after for a module chunk
// ---------------------------------------------------------------------------
async function showModuleChunk(job, module, chunkIdx = 0) {
  const pad = String(chunkIdx).padStart(2, "0");
  const initPath      = `tasks/v4/${job.shop}/${job.jobId}/init/${module}/chunk-${pad}.json`;
  const translatePath = `tasks/v4/${job.shop}/${job.jobId}/translate/${module}/chunk-${pad}.json`;

  const initData      = await readBlob(initPath);
  const translateData = await readBlob(translatePath);

  printSep(`${module} / chunk-${pad}`);
  console.log(`Init blob:      ${initPath}`);
  console.log(`Translate blob: ${translatePath}`);

  if (!initData && !translateData) {
    console.log("Neither init nor translate chunk found.");
    return;
  }

  // Build lookup: resourceId -> translated fields
  const txMap = new Map();
  if (translateData) {
    for (const r of translateData) {
      txMap.set(r.resourceId, r.translations ?? []);
    }
  }

  const resources = initData ?? translateData.map(r => ({ resourceId: r.resourceId, fields: r.translations.map(t => ({ key: t.key, value: t.originalValue ?? "" })) }));

  console.log(`\nResources: ${resources.length}\n`);

  for (const resource of resources) {
    printSep(`resourceId: ${resource.resourceId}`);
    const txFields = txMap.get(resource.resourceId) ?? [];
    const txLookup = new Map(txFields.map(t => [t.key, t]));

    const fields = resource.fields ?? resource.translations?.map(t => ({ key: t.key, value: t.originalValue ?? "" })) ?? [];

    for (const field of fields) {
      const tx = txLookup.get(field.key);
      console.log(`  ┌ key: ${field.key}`);
      console.log(`  │ ORIGINAL:   ${truncate(field.value)}`);
      if (tx) {
        console.log(`  │ TRANSLATED: ${truncate(tx.translatedValue)}`);
        console.log(`  │ status:     ${tx.status ?? "?"}`);
      } else {
        console.log(`  │ TRANSLATED: (not yet translated)`);
      }
      console.log("  └");
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const [,, jobIdArg, moduleArg, chunkArg] = process.argv;

if (!jobIdArg) {
  await showJobs();
  process.exit(0);
}

// Find matching job
const allJobs = await listJobs();
const job = allJobs.find(j => j.jobId.startsWith(jobIdArg) || j.jobId === jobIdArg);
if (!job) {
  console.error(`No job found matching: ${jobIdArg}`);
  console.error("Run without arguments to list all jobs.");
  process.exit(1);
}

if (!moduleArg) {
  await showJobSummary(job);
} else {
  await showModuleChunk(job, moduleArg.toUpperCase(), Number(chunkArg ?? 0));
}
