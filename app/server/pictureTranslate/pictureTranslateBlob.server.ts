import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { getTranslateV3BlobContainer } from "../translation/translateBlobStore.server";

function blobConnectionString(): string {
  const conn =
    process.env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim() ||
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) {
    throw new Error(
      "Blob 未配置：请设置 BLOB_TRANSLATE_V3_CONNECTION_STRING 或 AZURE_BLOB_CONNECTION_STRING",
    );
  }
  return conn;
}

function blobContainerName(): string {
  return (
    process.env.BLOB_TRANSLATE_V3_CONTAINER?.trim() ||
    process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() ||
    "translate-v3"
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

/** 未配置 env 时默认 7 天；Spark 测试/生产 Blob 账号通常禁止匿名读，聊天内嵌图必须带 SAS。 */
export const DEFAULT_PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES = 7 * 24 * 60;

/**
 * 解析译图 Blob SAS 有效期（分钟）。
 * - 未设置：默认 7 天
 * - 正整数：使用该值
 * - `0`：不附加 SAS（仅适用于容器已公共读的场景）
 */
export function resolvePictureTranslateBlobSasTtlMinutes(): number | null {
  const raw = process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES?.trim();
  if (raw === "0") return null;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES;
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

/**
 * 上传译后 JPEG 字节至与 V3 翻译相同的 Azure 容器，路径前缀 `picture-translate/`，避免与 chunk 冲突。
 * 默认在 URL 上附加只读 SAS（见 `resolvePictureTranslateBlobSasTtlMinutes`）。
 */
function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "jpeg":
    case "jpg":
    default:
      return "image/jpeg";
  }
}

/**
 * 上传源图（供 Aidge 等需要 HTTPS imageUrl 的上游使用），路径 `picture-translate/source/`。
 */
export async function uploadPictureTranslateSourceImageAndGetUrl(params: {
  shop: string;
  imageBytes: Buffer;
  extension: string;
}): Promise<string> {
  const ext = params.extension.toLowerCase() === "jpeg" ? "jpg" : params.extension.toLowerCase();
  const container = await getTranslateV3BlobContainer();
  const id = crypto.randomUUID();
  const blobPath = `picture-translate/source/${sanitizeShopSegment(params.shop)}/${id}.${ext}`;
  const client = container.getBlockBlobClient(blobPath);

  await client.uploadData(params.imageBytes, {
    blobHTTPHeaders: { blobContentType: contentTypeForExtension(ext) },
  });

  const sasTtl = resolvePictureTranslateBlobSasTtlMinutes();
  if (sasTtl == null) {
    return client.url;
  }

  return appendReadSasToBlobUrl({
    blobUrl: client.url,
    blobPath,
    sasTtlMinutes: sasTtl,
  });
}

export async function uploadPictureTranslateJpegAndGetUrl(params: {
  shop: string;
  jpegBytes: Buffer;
}): Promise<string> {
  const container = await getTranslateV3BlobContainer();
  const id = crypto.randomUUID();
  const blobPath = `picture-translate/${sanitizeShopSegment(params.shop)}/${id}.jpg`;
  const client = container.getBlockBlobClient(blobPath);

  await client.uploadData(params.jpegBytes, {
    blobHTTPHeaders: { blobContentType: "image/jpeg" },
  });

  const sasTtl = resolvePictureTranslateBlobSasTtlMinutes();
  if (sasTtl == null) {
    return client.url;
  }

  return appendReadSasToBlobUrl({
    blobUrl: client.url,
    blobPath,
    sasTtlMinutes: sasTtl,
  });
}
