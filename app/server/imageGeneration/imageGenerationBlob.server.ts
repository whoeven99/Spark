import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { getTranslationBlobContainer } from "../translation/translateBlobStore.server";
import { resolvePictureTranslateBlobSasTtlMinutes } from "../pictureTranslate/pictureTranslateBlob.server";

function blobConnectionString(): string {
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) {
    throw new Error("Blob 未配置：请设置 AZURE_BLOB_CONNECTION_STRING");
  }
  return conn;
}

function blobContainerName(): string {
  return (
    process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content"
  );
}

function parseAccountFromConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
} {
  const map: Record<string, string> = {};
  for (const segment of connectionString.split(";")) {
    const idx = segment.indexOf("=");
    if (idx === -1) continue;
    const key = segment.slice(0, idx);
    const value = segment.slice(idx + 1);
    map[key] = value;
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

export function buildGeneratedImageBlobPath(params: {
  shop: string;
  requestId: string;
  extension?: "png" | "jpg";
}): string {
  const ext = params.extension ?? "png";
  return `generated-images/${sanitizeShopSegment(params.shop)}/${params.requestId}.${ext}`;
}

export function getGeneratedImageReadUrl(blobPath: string): string {
  const containerName = blobContainerName();
  const conn = blobConnectionString();
  const { accountName } = parseAccountFromConnectionString(conn);
  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobPath}`;

  const sasTtl =
    resolveImageGenerationBlobSasTtlMinutes() ??
    resolvePictureTranslateBlobSasTtlMinutes();
  if (sasTtl == null) {
    return blobUrl;
  }

  return appendReadSasToBlobUrl({
    blobUrl,
    blobPath,
    sasTtlMinutes: sasTtl,
  });
}

function resolveImageGenerationBlobSasTtlMinutes(): number | null {
  const raw = process.env.IMAGE_GEN_BLOB_SAS_TTL_MINUTES?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 60 * 24 * 30);
}

/** 上传文生图 PNG/JPEG 至 Azure，路径前缀 `generated-images/`。 */
export async function uploadGeneratedImageAndGetUrl(params: {
  shop: string;
  imageBytes: Buffer;
  requestId: string;
  extension?: "png" | "jpg";
}): Promise<{ imageUrl: string; blobPath: string }> {
  const ext = params.extension ?? "png";
  const container = await getTranslationBlobContainer();
  const blobPath = buildGeneratedImageBlobPath({
    shop: params.shop,
    requestId: params.requestId,
    extension: ext,
  });
  const client = container.getBlockBlobClient(blobPath);
  const contentType = ext === "jpg" ? "image/jpeg" : "image/png";

  await client.uploadData(params.imageBytes, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  const imageUrl = getGeneratedImageReadUrl(blobPath);
  return { imageUrl, blobPath };
}
