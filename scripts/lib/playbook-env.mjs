import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

/** Load KEY=VALUE from repo root `.env` (no dotenv dependency). */
export function loadEnv() {
  const merged = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
      if (merged[key] == null || merged[key] === "") {
        merged[key] = line.slice(eq + 1).trim();
      }
    }
  } catch {
    /* no .env */
  }
  return merged;
}

export function requireEnv(env, keys) {
  const missing = keys.filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new Error(`缺少环境变量（请在根目录 .env 配置）：${missing.join(", ")}`);
  }
}

export function getBlobContainer(env) {
  requireEnv(env, ["AZURE_BLOB_CONNECTION_STRING"]);
  const name = env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content";
  const client = BlobServiceClient.fromConnectionString(env.AZURE_BLOB_CONNECTION_STRING);
  return { container: client.getContainerClient(name), containerName: name };
}

export function getCosmosJobsContainer(env) {
  requireEnv(env, ["COSMOS_ENDPOINT", "COSMOS_KEY"]);
  const client = new CosmosClient({ endpoint: env.COSMOS_ENDPOINT, key: env.COSMOS_KEY });
  const dbId = env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
  const containerId = env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";
  return client.database(dbId).container(containerId);
}

export async function readBlobJson(container, path) {
  try {
    const buf = await container.getBlobClient(path).downloadToBuffer();
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

/** Resolve { shop, jobId } from full UUID or prefix via Blob listing. */
export async function resolveJob(container, jobIdOrPrefix, shopOverride) {
  if (shopOverride) {
    return { shop: shopOverride, jobId: jobIdOrPrefix };
  }

  const matches = [];
  for await (const blob of container.listBlobsFlat({ prefix: "tasks/v4/" })) {
    const parts = blob.name.split("/");
    if (parts.length < 4) continue;
    const shop = parts[2];
    const jobId = parts[3];
    if (jobId === jobIdOrPrefix || jobId.startsWith(jobIdOrPrefix)) {
      matches.push({
        shop,
        jobId,
        lastModified: blob.properties.lastModified ?? new Date(0),
      });
    }
  }

  if (!matches.length) {
    throw new Error(`Blob 中未找到任务：${jobIdOrPrefix}（可先运行 node scripts/blob-inspect-translation.mjs 列任务）`);
  }

  matches.sort((a, b) => b.lastModified - a.lastModified);
  const best = matches[0];
  if (matches.length > 1) {
    const uniq = new Set(matches.map((m) => m.jobId));
    if (uniq.size > 1) {
      console.warn(
        `[playbook] 前缀 ${jobIdOrPrefix} 匹配 ${uniq.size} 个任务，使用最近更新的 ${best.jobId}`,
      );
    }
  }
  return { shop: best.shop, jobId: best.jobId };
}

export async function fetchCosmosJob(jobsContainer, shop, jobId) {
  try {
    const { resource } = await jobsContainer.item(jobId, shop).read();
    return resource ?? null;
  } catch {
    return null;
  }
}

export const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export const UNTIL_STATUS = {
  translate: new Set([
    "TRANSLATE_DONE",
    "WRITEBACK_QUEUED",
    "WRITING_BACK",
    "VERIFY_QUEUED",
    "VERIFYING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ]),
  writeback: new Set(["VERIFY_QUEUED", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"]),
  complete: new Set(["COMPLETED", "FAILED", "CANCELLED"]),
};

export function repoRoot() {
  return ROOT;
}
