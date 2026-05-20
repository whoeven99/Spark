import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { getTranslateV3BlobContainer } from "../translation/translateBlobStore.server";
import { resolvePictureTranslateBlobSasTtlMinutes } from "../pictureTranslate/pictureTranslateBlob.server";

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

/** 上传文生图 PNG/JPEG 至 Azure，路径前缀 `generated-images/`。 */
export async function uploadGeneratedImageAndGetUrl(params: {
  shop: string;
  imageBytes: Buffer;
  requestId: string;
  extension?: "png" | "jpg";
}): Promise<string> {
  const ext = params.extension ?? "png";
  const container = await getTranslateV3BlobContainer();
  const blobPath = `generated-images/${sanitizeShopSegment(params.shop)}/${params.requestId}.${ext}`;
  const client = container.getBlockBlobClient(blobPath);
  const contentType = ext === "jpg" ? "image/jpeg" : "image/png";

  await client.uploadData(params.imageBytes, {
    blobHTTPHeaders: { blobContentType: contentType },
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
