import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";
import IORedis from "ioredis";
import { BlobServiceClient } from "@azure/storage-blob";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(resolve(__dirname, "../../.env"));

const prefixes = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const listFailed = process.argv.includes("--list-failed");

const endpoint = process.env.COSMOS_ENDPOINT?.trim();
const key = process.env.COSMOS_KEY?.trim();
const db = process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const containerId =
  process.env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";

if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT / COSMOS_KEY not configured");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const container = client.database(db).container(containerId);

const jobs = [];

if (listFailed) {
  const { resources } = await container.items
    .query({
      query:
        "SELECT TOP 30 c.id, c.shopName, c.status, c.source, c.target, c.errorStage, c.errorMessage, c.metrics, c.stageTimings, c.updatedAt, c.blobPrefix FROM c WHERE c.status = 'FAILED' ORDER BY c.updatedAt DESC",
    })
    .fetchAll();
  jobs.push(...resources);
} else if (prefixes.length === 0) {
  console.error("Usage: node diag-failed-jobs.mjs <jobIdPrefix> [...] | --list-failed");
  process.exit(1);
} else {
  for (const prefix of prefixes) {
    const { resources } = await container.items
      .query({
        query:
          "SELECT * FROM c WHERE STARTSWITH(c.id, @prefix) OR CONTAINS(c.id, @prefix) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 3",
        parameters: [{ name: "@prefix", value: prefix }],
      })
      .fetchAll();
    jobs.push(...resources);
  }
}

console.log(`=== Found ${jobs.length} job(s) ===\n`);
for (const j of jobs) {
  console.log(
    JSON.stringify(
      {
        id: j.id,
        shop: j.shopName,
        status: j.status,
        route: `${j.source} -> ${j.target}`,
        modules: j.modules,
        errorStage: j.errorStage,
        errorMessage: j.errorMessage,
        metrics: j.metrics,
        stageTimings: j.stageTimings,
        aiModel: j.aiModel,
        claimedBy: j.claimedBy,
        updatedAt: j.updatedAt,
        blobPrefix: j.blobPrefix,
      },
      null,
      2,
    ),
  );
  console.log("");
}

function createRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 8_000,
      lazyConnect: true,
    });
  }
  return null;
}

const redis = createRedis();
if (redis) {
  await redis.connect();
  for (const j of jobs) {
    const prog = await redis.hgetall(`translate:v4:progress:${j.id}`);
    const ctrl = await redis.hgetall(`translate:v4:control:${j.id}`);
    console.log(`--- Redis progress ${j.id} ---`);
    console.log(prog);
    if (Object.keys(ctrl).length) {
      console.log(`--- Redis control ${j.id} ---`);
      console.log(ctrl);
    }
  }
  await redis.quit();
}

const blobConn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
const blobContainer =
  process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content";

if (blobConn) {
  const blobClient = BlobServiceClient.fromConnectionString(blobConn).getContainerClient(
    blobContainer,
  );
  for (const j of jobs) {
    const prefix = j.blobPrefix ?? `tasks/v4/${j.shopName}/${j.id}`;
    const paths = [];
    for await (const item of blobClient.listBlobsFlat({ prefix })) {
      paths.push(item.name);
    }
    const initCount = paths.filter((p) => p.includes("/init/")).length;
    const translateCount = paths.filter((p) => p.includes("/translate/")).length;
    console.log(`--- Blob ${j.id} (${paths.length} files, init=${initCount}, translate=${translateCount}) ---`);
    console.log("manifest:", paths.includes(`${prefix}/manifest.json`));
    const sample = paths.filter((p) => p.endsWith(".json")).slice(0, 8);
    console.log("sample:", sample);
  }
}
