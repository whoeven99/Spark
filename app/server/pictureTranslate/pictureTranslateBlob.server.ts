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

/**
 * 上传译后 JPEG 字节至与 V3 翻译相同的 Azure 容器，路径前缀 `picture-translate/`，避免与 chunk 冲突。
 * 若设置 `PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES`（正整数），则在 URL 上附加只读 SAS；否则返回默认 Blob URL（依赖容器公共读或网关）。
 */
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

  const sasTtl = Number(
    process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES ?? "",
  );
  if (!Number.isFinite(sasTtl) || sasTtl <= 0) {
    return client.url;
  }

  const conn = blobConnectionString();
  const { accountName, accountKey } = parseAccountFromConnectionString(conn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  const containerName = blobContainerName();
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + sasTtl * 60_000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
    },
    cred,
  ).toString();

  return `${client.url}?${sas}`;
}
