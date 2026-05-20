import type { ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient } from "@azure/storage-blob";

const LOG_PREFIX = "[ShopProfile][Blob]";

const DEFAULT_CONTAINER = "spark-shop-profiles";

let containerPromise: Promise<ContainerClient> | null = null;

export type ShopProfileBlobConnectionSource =
  | "SHOP_PROFILE_BLOB_CONNECTION_STRING"
  | "BLOB_TRANSLATE_V3_CONNECTION_STRING"
  | "AZURE_BLOB_CONNECTION_STRING"
  | "none";

export type ShopProfileBlobProbe = {
  shop: string;
  connectionSource: ShopProfileBlobConnectionSource;
  accountName: string | null;
  container: string;
  blobPath: string;
  /** 无 SAS 的 blob URL，便于与 Portal 存储账户核对 */
  blobUrl: string | null;
  exists: boolean;
  contentLength: number | null;
  lastModified: string | null;
  contentType: string | null;
  readOk: boolean;
  readBytes: number | null;
  readPreview: string | null;
  error: string | null;
};

function shopProfileBlobConnectionString(): string | null {
  const conn =
    process.env.SHOP_PROFILE_BLOB_CONNECTION_STRING?.trim() ||
    process.env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim() ||
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  return conn || null;
}

export function shopProfileBlobConnectionSource(): ShopProfileBlobConnectionSource {
  if (process.env.SHOP_PROFILE_BLOB_CONNECTION_STRING?.trim()) {
    return "SHOP_PROFILE_BLOB_CONNECTION_STRING";
  }
  if (process.env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim()) {
    return "BLOB_TRANSLATE_V3_CONNECTION_STRING";
  }
  if (process.env.AZURE_BLOB_CONNECTION_STRING?.trim()) {
    return "AZURE_BLOB_CONNECTION_STRING";
  }
  return "none";
}

function parseAccountNameFromConnectionString(conn: string): string | null {
  const match = /AccountName=([^;]+)/i.exec(conn);
  return match?.[1]?.trim() ?? null;
}

function shopProfileBlobContainerName(): string {
  return (
    process.env.SHOP_PROFILE_BLOB_CONTAINER?.trim() || DEFAULT_CONTAINER
  );
}

export function isShopProfileBlobConfigured(): boolean {
  return Boolean(shopProfileBlobConnectionString());
}

export function shopProfileBlobPath(shop: string): string {
  const safe = shop.trim().toLowerCase();
  return `shops/${safe}/profile.md`;
}

/** 打印当前代码使用的 Blob 目标（不含密钥） */
export function logShopProfileBlobTarget(shop: string, context: string): void {
  const conn = shopProfileBlobConnectionString();
  const accountName = conn ? parseAccountNameFromConnectionString(conn) : null;
  const container = shopProfileBlobContainerName();
  const blobPath = shopProfileBlobPath(shop);
  console.info(
    `${LOG_PREFIX} target context=${context} shop=${shop} connectionSource=${shopProfileBlobConnectionSource()} accountName=${accountName ?? "unknown"} container=${container} blobPath=${blobPath}`,
  );
}

async function getShopProfileBlobContainer(): Promise<ContainerClient> {
  const conn = shopProfileBlobConnectionString();
  if (!conn) {
    throw new Error(
      "Shop profile Blob 未配置：请设置 SHOP_PROFILE_BLOB_CONNECTION_STRING 或 AZURE_BLOB_CONNECTION_STRING",
    );
  }
  if (!containerPromise) {
    containerPromise = (async () => {
      const accountName = parseAccountNameFromConnectionString(conn);
      const containerName = shopProfileBlobContainerName();
      console.info(
        `${LOG_PREFIX} init container accountName=${accountName ?? "unknown"} container=${containerName} connectionSource=${shopProfileBlobConnectionSource()}`,
      );
      const service = BlobServiceClient.fromConnectionString(conn);
      const container = service.getContainerClient(containerName);
      await container.createIfNotExists();
      return container;
    })();
  }
  return containerPromise;
}

/**
 * 探测 Blob 是否存在及元数据（用于与 Azure Portal 路径核对）。
 */
export async function probeShopProfileBlob(shop: string): Promise<ShopProfileBlobProbe> {
  const shopTrim = shop.trim();
  const connectionSource = shopProfileBlobConnectionSource();
  const container = shopProfileBlobContainerName();
  const blobPath = shopProfileBlobPath(shopTrim);
  const conn = shopProfileBlobConnectionString();
  const accountName = conn ? parseAccountNameFromConnectionString(conn) : null;

  const base: ShopProfileBlobProbe = {
    shop: shopTrim,
    connectionSource,
    accountName,
    container,
    blobPath,
    blobUrl: null,
    exists: false,
    contentLength: null,
    lastModified: null,
    contentType: null,
    readOk: false,
    readBytes: null,
    readPreview: null,
    error: null,
  };

  if (!conn) {
    base.error = "no_connection_string";
    return base;
  }

  try {
    const containerClient = await getShopProfileBlobContainer();
    const client = containerClient.getBlockBlobClient(blobPath);
    base.blobUrl = client.url;

    const exists = await client.exists();
    base.exists = exists;

    if (exists) {
      const props = await client.getProperties();
      base.contentLength = props.contentLength ?? null;
      base.lastModified = props.lastModified?.toISOString() ?? null;
      base.contentType = props.contentType ?? null;

      try {
        const buf = await client.downloadToBuffer();
        const text = buf.toString("utf8");
        base.readOk = true;
        base.readBytes = buf.length;
        base.readPreview = text.slice(0, 120).replace(/\s+/g, " ");
      } catch (readErr) {
        base.error = `read_failed: ${readErr instanceof Error ? readErr.message : String(readErr)}`;
      }
    }

    return base;
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
    return base;
  }
}

export function logShopProfileBlobProbe(probe: ShopProfileBlobProbe, context: string): void {
  console.info(
    `${LOG_PREFIX} probe context=${context} ${JSON.stringify({
      shop: probe.shop,
      connectionSource: probe.connectionSource,
      accountName: probe.accountName,
      container: probe.container,
      blobPath: probe.blobPath,
      blobUrl: probe.blobUrl,
      exists: probe.exists,
      contentLength: probe.contentLength,
      lastModified: probe.lastModified,
      readOk: probe.readOk,
      readBytes: probe.readBytes,
      readPreview: probe.readPreview,
      error: probe.error,
    })}`,
  );
}

export async function writeShopProfileMarkdown(
  shop: string,
  markdown: string,
): Promise<{ container: string; path: string }> {
  const path = shopProfileBlobPath(shop);
  logShopProfileBlobTarget(shop, "write");
  const container = await getShopProfileBlobContainer();
  const client = container.getBlockBlobClient(path);
  await client.upload(markdown, Buffer.byteLength(markdown, "utf8"), {
    blobHTTPHeaders: { blobContentType: "text/markdown; charset=utf-8" },
  });
  const probe = await probeShopProfileBlob(shop);
  logShopProfileBlobProbe(probe, "after_write");
  return { container: shopProfileBlobContainerName(), path };
}

export async function readShopProfileMarkdown(shop: string): Promise<string | null> {
  const path = shopProfileBlobPath(shop);
  logShopProfileBlobTarget(shop, "read");
  try {
    const container = await getShopProfileBlobContainer();
    const client = container.getBlockBlobClient(path);
    const exists = await client.exists();
    if (!exists) {
      const probe = await probeShopProfileBlob(shop);
      logShopProfileBlobProbe(probe, "read_not_found");
      return null;
    }
    const buf = await client.downloadToBuffer();
    const text = buf.toString("utf8");
    const probe = await probeShopProfileBlob(shop);
    logShopProfileBlobProbe(probe, "read_ok");
    return text;
  } catch (error) {
    console.error(
      `${LOG_PREFIX} read failed shop=${shop} path=${path}`,
      error,
    );
    const probe = await probeShopProfileBlob(shop);
    probe.error = error instanceof Error ? error.message : String(error);
    logShopProfileBlobProbe(probe, "read_error");
    return null;
  }
}
