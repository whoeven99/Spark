import type { ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient } from "@azure/storage-blob";

const DEFAULT_CONTAINER = "spark-shop-profiles";

let containerPromise: Promise<ContainerClient> | null = null;

function shopProfileBlobConnectionString(): string | null {
  const conn =
    process.env.SHOP_PROFILE_BLOB_CONNECTION_STRING?.trim() ||
    process.env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim() ||
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  return conn || null;
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

async function getShopProfileBlobContainer(): Promise<ContainerClient> {
  const conn = shopProfileBlobConnectionString();
  if (!conn) {
    throw new Error(
      "Shop profile Blob 未配置：请设置 SHOP_PROFILE_BLOB_CONNECTION_STRING 或 AZURE_BLOB_CONNECTION_STRING",
    );
  }
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(conn);
      const container = service.getContainerClient(shopProfileBlobContainerName());
      await container.createIfNotExists();
      return container;
    })();
  }
  return containerPromise;
}

export async function writeShopProfileMarkdown(
  shop: string,
  markdown: string,
): Promise<{ container: string; path: string }> {
  const path = shopProfileBlobPath(shop);
  const container = await getShopProfileBlobContainer();
  const client = container.getBlockBlobClient(path);
  await client.upload(markdown, Buffer.byteLength(markdown, "utf8"), {
    blobHTTPHeaders: { blobContentType: "text/markdown; charset=utf-8" },
  });
  return { container: shopProfileBlobContainerName(), path };
}

export async function readShopProfileMarkdown(shop: string): Promise<string | null> {
  const path = shopProfileBlobPath(shop);
  try {
    const container = await getShopProfileBlobContainer();
    const client = container.getBlockBlobClient(path);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
