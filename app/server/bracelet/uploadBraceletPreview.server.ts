import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

/** 订单履约需长期可访问，默认 90 天 SAS */
export const DEFAULT_BRACELET_PREVIEW_SAS_TTL_MINUTES = 90 * 24 * 60;

function blobConnectionString(): string {
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) {
    throw new Error(
      "Blob 未配置：请设置 AZURE_BLOB_CONNECTION_STRING（用于手环预览图上传）",
    );
  }
  return conn;
}

function blobContainerName(): string {
  return (
    process.env.AZURE_BLOB_BRACELET_PREVIEW_CONTAINER?.trim() ||
    process.env.AZURE_BLOB_PICTURE_TRANSLATE_CONTAINER?.trim() ||
    "picturetranslate"
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
    map[segment.slice(0, idx)] = segment.slice(idx + 1);
  }
  const accountName = map.AccountName;
  const accountKey = map.AccountKey;
  if (!accountName || !accountKey) {
    throw new Error("Blob 连接串缺少 AccountName 或 AccountKey");
  }
  return { accountName, accountKey };
}

function sanitizeShopSegment(shop: string): string {
  return shop.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

export function resolveBraceletPreviewSasTtlMinutes(): number {
  const raw = process.env.BRACELET_PREVIEW_BLOB_SAS_TTL_MINUTES?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_BRACELET_PREVIEW_SAS_TTL_MINUTES;
}

function appendReadSas(blobUrl: string, blobPath: string, ttlMinutes: number): string {
  const conn = blobConnectionString();
  const { accountName, accountKey } = parseAccountFromConnectionString(conn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: blobContainerName(),
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(Date.now() - 60_000),
      expiresOn: new Date(Date.now() + ttlMinutes * 60_000),
    },
    cred,
  ).toString();
  return `${blobUrl}?${sas}`;
}

export async function uploadBraceletPreviewPng(params: {
  shop: string;
  pngBytes: Buffer;
}): Promise<string> {
  const conn = blobConnectionString();
  const service = BlobServiceClient.fromConnectionString(conn);
  const container = service.getContainerClient(blobContainerName());
  const id = crypto.randomUUID();
  const blobPath = `bracelet-preview/${sanitizeShopSegment(params.shop)}/${id}.png`;
  const client = container.getBlockBlobClient(blobPath);

  await client.uploadData(params.pngBytes, {
    blobHTTPHeaders: { blobContentType: "image/png" },
  });

  const cdnBase = process.env.BRACELET_PREVIEW_CDN_BASE_URL?.trim().replace(/\/+$/, "");
  if (cdnBase) {
    return `${cdnBase}/${blobPath}`;
  }

  return appendReadSas(client.url, blobPath, resolveBraceletPreviewSasTtlMinutes());
}

export function parsePreviewDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}
