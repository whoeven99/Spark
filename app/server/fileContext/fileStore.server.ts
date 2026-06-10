import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import prisma from "../../db.server";

const CONTAINER_NAME = "workspace-files";
const DOWNLOAD_SAS_TTL_MINUTES = 60; // 1-hour download link

function blobConnectionString(): string {
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("未配置 AZURE_BLOB_CONNECTION_STRING");
  return conn;
}

function sanitizeShop(shop: string): string {
  return shop.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
}

function parsedTextPath(shop: string, fileId: string): string {
  return `${sanitizeShop(shop)}/${fileId}/parsed.txt`;
}

function originalFilePath(shop: string, fileId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
  return `${sanitizeShop(shop)}/${fileId}/original_${safe}`;
}

function parseAccount(conn: string): { accountName: string; accountKey: string } {
  const map: Record<string, string> = {};
  for (const seg of conn.split(";")) {
    const idx = seg.indexOf("=");
    if (idx === -1) continue;
    map[seg.slice(0, idx)] = seg.slice(idx + 1);
  }
  if (!map.AccountName || !map.AccountKey) {
    throw new Error("Blob 连接串缺少 AccountName 或 AccountKey");
  }
  return { accountName: map.AccountName, accountKey: map.AccountKey };
}

async function getContainer() {
  const service = BlobServiceClient.fromConnectionString(blobConnectionString());
  const container = service.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();
  return container;
}

function buildSasUrl(blobPath: string): string {
  const conn = blobConnectionString();
  const { accountName, accountKey } = parseAccount(conn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + DOWNLOAD_SAS_TTL_MINUTES * 60_000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
    },
    cred,
  ).toString();
  const { accountName: acc } = parseAccount(conn);
  return `https://${acc}.blob.core.windows.net/${CONTAINER_NAME}/${blobPath}?${sas}`;
}

// ── write ────────────────────────────────────────────────────────────────────

export async function uploadParsedFile(params: {
  shop: string;
  fileId: string;
  name: string;
  mimeType: string;
  text: string;
  originalBytes: Buffer;
  originalSize: number;
  charCount: number;
}): Promise<void> {
  const container = await getContainer();

  // 1. parsed text
  const textPath = parsedTextPath(params.shop, params.fileId);
  await container.getBlockBlobClient(textPath).uploadData(
    Buffer.from(params.text, "utf-8"),
    { blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" } },
  );

  // 2. original file
  const origPath = originalFilePath(params.shop, params.fileId, params.name);
  await container.getBlockBlobClient(origPath).uploadData(params.originalBytes, {
    blobHTTPHeaders: {
      blobContentType: params.mimeType || "application/octet-stream",
      blobContentDisposition: `attachment; filename="${params.name}"`,
    },
  });

  await prisma.workspaceFile.create({
    data: {
      id: params.fileId,
      shop: params.shop,
      name: params.name,
      mimeType: params.mimeType,
      originalSize: params.originalSize,
      charCount: params.charCount,
      blobPath: textPath,
      originalBlobPath: origPath,
    },
  });
}

// ── read ─────────────────────────────────────────────────────────────────────

export async function loadParsedFileText(
  shop: string,
  fileId: string,
): Promise<string | null> {
  const record = await prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { blobPath: true },
  });
  if (!record) return null;
  return downloadBlobText(record.blobPath);
}

export async function loadMultipleFilesText(
  shop: string,
  fileIds: string[],
): Promise<Array<{ id: string; name: string; text: string }>> {
  if (!fileIds.length) return [];
  const records = await prisma.workspaceFile.findMany({
    where: { id: { in: fileIds }, shop },
    select: { id: true, name: true, blobPath: true },
  });
  const results = await Promise.all(
    records.map(async (r: { id: string; name: string; blobPath: string }) => {
      const text = (await downloadBlobText(r.blobPath)) ?? "";
      return { id: r.id, name: r.name, text };
    }),
  );
  return results.filter((r) => r.text.length > 0);
}

/** 生成原始文件的临时可读 SAS URL（1 小时有效）。 */
export async function getOriginalFileDownloadUrl(
  shop: string,
  fileId: string,
): Promise<string | null> {
  const record = await prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { originalBlobPath: true, name: true },
  });
  if (!record?.originalBlobPath) return null;
  return buildSasUrl(record.originalBlobPath);
}

export async function getWorkspaceFileMeta(shop: string, fileId: string) {
  return prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: {
      id: true,
      name: true,
      mimeType: true,
      originalSize: true,
      charCount: true,
      originalBlobPath: true,
      createdAt: true,
    },
  });
}

export async function listWorkspaceFiles(shop: string) {
  return prisma.workspaceFile.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      mimeType: true,
      originalSize: true,
      charCount: true,
      createdAt: true,
    },
  });
}

// ── delete ───────────────────────────────────────────────────────────────────

export async function deleteWorkspaceFile(
  shop: string,
  fileId: string,
): Promise<void> {
  const record = await prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { blobPath: true, originalBlobPath: true },
  });
  if (!record) return;

  const container = await getContainer();
  await Promise.allSettled([
    container.getBlockBlobClient(record.blobPath).deleteIfExists(),
    record.originalBlobPath
      ? container.getBlockBlobClient(record.originalBlobPath).deleteIfExists()
      : Promise.resolve(),
  ]);

  await prisma.workspaceFile.delete({ where: { id: fileId } });
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function downloadBlobText(blobPath: string): Promise<string | null> {
  try {
    const container = await getContainer();
    const download = await container.getBlockBlobClient(blobPath).download(0);
    const chunks: Buffer[] = [];
    for await (const chunk of download.readableStreamBody as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return null;
  }
}
