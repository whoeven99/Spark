import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import { Cluster, Redis } from "ioredis";
import { withIoRetry } from "./ioRetry.mjs";

export function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量: ${name}`);
  return v;
}

export function getEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function isRedisClusterMode() {
  const v = process.env.REDIS_CLUSTER?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return true;
}

export function createRedisClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "rediss:" ? 6380 : 6379;
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
  const tls =
    parsed.protocol === "rediss:" ? { servername: parsed.hostname } : undefined;
  const commonOpts = {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 10_000,
    lazyConnect: true,
  };

  if (isRedisClusterMode()) {
    return new Cluster([{ host: parsed.hostname, port }], {
      dnsLookup: (address, callback) => callback(null, address),
      slotsRefreshTimeout: 10_000,
      redisOptions: { ...commonOpts, password, tls },
    });
  }
  return new Redis(url, commonOpts);
}

export function getCosmosJobsContainer() {
  const client = new CosmosClient({
    endpoint: requireEnv("COSMOS_ENDPOINT"),
    key: requireEnv("COSMOS_KEY"),
  });
  const db = getEnv("COSMOS_TRANSLATION_DATABASE_ID", "translation");
  const container = getEnv("COSMOS_TRANSLATION_V4_JOBS_CONTAINER", "translation_v4_jobs");
  return client.database(db).container(container);
}

export function getBlobContainer() {
  const conn = requireEnv("AZURE_BLOB_CONNECTION_STRING");
  const name = getEnv("AZURE_BLOB_TRANSLATION_CONTAINER", "translation-content");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(name);
}

export async function loadJob(container, jobId, shop) {
  if (shop) {
    const { resource } = await container.item(jobId, shop).read();
    return resource ?? null;
  }
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: jobId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export async function listJobsForShop(container, shopName, { limit = 0 } = {}) {
  const lim = limit > 0 ? limit : 500;
  return withIoRetry(
    async () => {
      const { resources } = await container.items
        .query(
          {
            query:
              "SELECT c.id, c.shopName, c.source, c.target, c.modules, c.status, c.aiModel, c.metrics, c.blobPrefix, c.createdAt, c.updatedAt, c.shopifyAccessToken, c.taskSource FROM c WHERE c.shopName = @shop ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
            parameters: [
              { name: "@shop", value: shopName },
              { name: "@limit", value: lim },
            ],
          },
          { partitionKey: shopName },
        )
        .fetchAll();
      return resources;
    },
    { label: `Cosmos listJobs ${shopName}` },
  );
}

/** 列出 Cosmos 中所有有翻译任务的店铺（去重）。 */
export async function listAllShops(container, { limit = 0, search = "" } = {}) {
  const lim = limit > 0 ? limit : 10_000;
  let query;
  const parameters = [{ name: "@limit", value: lim }];

  if (search) {
    query =
      "SELECT DISTINCT VALUE c.shopName FROM c WHERE CONTAINS(c.shopName, @search, true) OFFSET 0 LIMIT @limit";
    parameters.push({ name: "@search", value: search });
  } else {
    query = "SELECT DISTINCT VALUE c.shopName FROM c OFFSET 0 LIMIT @limit";
  }

  return withIoRetry(
    async () => {
      const { resources } = await container.items.query({ query, parameters }).fetchAll();
      return resources.filter(Boolean);
    },
    { label: "Cosmos listAllShops" },
  );
}

export async function blobListPaths(container, prefix) {
  return withIoRetry(
    async () => {
      const paths = [];
      for await (const item of container.listBlobsFlat({ prefix })) {
        paths.push(item.name);
      }
      return paths;
    },
    { label: `Blob list ${prefix.slice(0, 48)}` },
  );
}

export async function blobReadJson(container, path) {
  return withIoRetry(
    async () => {
      const client = container.getBlockBlobClient(path);
      if (!(await client.exists())) return null;
      const buf = await client.downloadToBuffer();
      return JSON.parse(buf.toString("utf8"));
    },
    { label: `Blob read ${path.split("/").slice(-2).join("/")}` },
  );
}

export async function blobWriteJson(container, path, data) {
  const text = JSON.stringify(data, null, 2);
  const client = container.getBlockBlobClient(path);
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}
