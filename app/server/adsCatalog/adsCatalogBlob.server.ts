import type { ContainerClient } from "@azure/storage-blob";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

const LOG_PREFIX = "[AdsCatalog][Blob]";
const DEFAULT_SAS_TTL_MINUTES = 60 * 24 * 7;

let containerPromise: Promise<ContainerClient> | null = null;

function blobConnectionString(): string {
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) {
    throw new Error("Blob 未配置：请设置 AZURE_BLOB_CONNECTION_STRING");
  }
  return conn;
}

function blobContainerName(): string {
  return process.env.AZURE_BLOB_ADS_CATALOG_CONTAINER?.trim() || "adscatalog";
}

export async function getAdsCatalogBlobContainer(): Promise<ContainerClient> {
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(blobConnectionString());
      const container = service.getContainerClient(blobContainerName());
      await container.createIfNotExists();
      return container;
    })();
  }
  return containerPromise;
}

function parseAccountFromConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
} {
  const map: Record<string, string> = {};
  for (const segment of connectionString.split(";")) {
    const idx = segment.indexOf("=");
    if (idx === -1) continue;
    map[segment.slice(0, idx)] = segment.slice(idx + 1);
  }
  const accountName = map.AccountName;
  const accountKey = map.AccountKey;
  if (!accountName || !accountKey) {
    throw new Error("Blob 连接串缺少 AccountName 或 AccountKey，无法生成 SAS");
  }
  return { accountName, accountKey };
}

function sanitizeShopSegment(shop: string): string {
  return shop.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

function resolveAdsCatalogBlobSasTtlMinutes(): number {
  const raw = process.env.ADS_CATALOG_BLOB_SAS_TTL_MINUTES?.trim();
  if (!raw) return DEFAULT_SAS_TTL_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SAS_TTL_MINUTES;
  return Math.min(Math.floor(n), 60 * 24 * 30);
}

function appendReadSasToBlobUrl(params: {
  blobUrl: string;
  blobPath: string;
  sasTtlMinutes: number;
}): string {
  const conn = blobConnectionString();
  const { accountName, accountKey } = parseAccountFromConnectionString(conn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  const containerName = blobContainerName();
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + params.sasTtlMinutes * 60_000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: params.blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
    },
    cred,
  ).toString();

  return `${params.blobUrl}?${sas}`;
}

export function buildTiktokFeedBlobPath(params: {
  shop: string;
  catalogId: string;
  taskId: string;
}): string {
  return `tiktok-feeds/${sanitizeShopSegment(params.shop)}/${sanitizeShopSegment(params.catalogId)}/${sanitizeShopSegment(params.taskId)}.csv`;
}

export function getTiktokFeedReadUrl(blobPath: string): string {
  const containerName = blobContainerName();
  const { accountName } = parseAccountFromConnectionString(blobConnectionString());
  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobPath}`;
  return appendReadSasToBlobUrl({
    blobUrl,
    blobPath,
    sasTtlMinutes: resolveAdsCatalogBlobSasTtlMinutes(),
  });
}

/** 上传 TikTok Catalog Feed CSV，返回带读 SAS 的公网 URL。 */
export async function uploadTiktokFeedCsvAndGetUrl(params: {
  shop: string;
  catalogId: string;
  taskId: string;
  csvText: string;
}): Promise<{ fileUrl: string; blobPath: string }> {
  const container = await getAdsCatalogBlobContainer();
  const blobPath = buildTiktokFeedBlobPath({
    shop: params.shop,
    catalogId: params.catalogId,
    taskId: params.taskId,
  });
  const client = container.getBlockBlobClient(blobPath);
  const bytes = Buffer.from(params.csvText, "utf8");

  console.info(
    `${LOG_PREFIX} step=feed_csv_upload shop=${params.shop} catalogId=${params.catalogId} taskId=${params.taskId} bytes=${bytes.length} path=${blobPath}`,
  );

  await client.uploadData(bytes, {
    blobHTTPHeaders: { blobContentType: "text/csv; charset=utf-8" },
  });

  const fileUrl = getTiktokFeedReadUrl(blobPath);
  return { fileUrl, blobPath };
}
