import { BlobServiceClient } from "@azure/storage-blob";
import prisma from "../../db.server";

const CONTAINER_NAME = "workspace-files";

function blobConnectionString(): string {
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("未配置 AZURE_BLOB_CONNECTION_STRING");
  return conn;
}

function sanitizeShop(shop: string): string {
  return shop.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
}

function blobPath(shop: string, fileId: string): string {
  return `${sanitizeShop(shop)}/${fileId}.txt`;
}

async function getContainer() {
  const service = BlobServiceClient.fromConnectionString(blobConnectionString());
  const container = service.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();
  return container;
}

export async function uploadParsedFile(params: {
  shop: string;
  fileId: string;
  name: string;
  text: string;
  originalSize: number;
  charCount: number;
}): Promise<void> {
  const container = await getContainer();
  const bp = blobPath(params.shop, params.fileId);
  const client = container.getBlockBlobClient(bp);
  const data = Buffer.from(params.text, "utf-8");
  await client.uploadData(data, {
    blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" },
  });

  await prisma.workspaceFile.create({
    data: {
      id: params.fileId,
      shop: params.shop,
      name: params.name,
      originalSize: params.originalSize,
      charCount: params.charCount,
      blobPath: bp,
    },
  });
}

export async function loadParsedFileText(
  shop: string,
  fileId: string,
): Promise<string | null> {
  const record = await prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { blobPath: true },
  });
  if (!record) return null;

  const container = await getContainer();
  const client = container.getBlockBlobClient(record.blobPath);
  try {
    const download = await client.download(0);
    const chunks: Buffer[] = [];
    for await (const chunk of download.readableStreamBody as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return null;
  }
}

export async function loadMultipleFilesText(
  shop: string,
  fileIds: string[],
): Promise<Array<{ id: string; name: string; text: string }>> {
  if (fileIds.length === 0) return [];

  const records = await prisma.workspaceFile.findMany({
    where: { id: { in: fileIds }, shop },
    select: { id: true, name: true, blobPath: true },
  });

  const container = await getContainer();
  const results = await Promise.all(
    records.map(async (record: { id: string; name: string; blobPath: string }) => {
      const client = container.getBlockBlobClient(record.blobPath);
      try {
        const download = await client.download(0);
        const chunks: Buffer[] = [];
        for await (const chunk of download.readableStreamBody as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString("utf-8");
        return { id: record.id, name: record.name, text };
      } catch {
        return { id: record.id, name: record.name, text: "" };
      }
    }),
  );
  return results.filter((r: { text: string }) => r.text.length > 0) as Array<{ id: string; name: string; text: string }>;
}

export async function deleteWorkspaceFile(
  shop: string,
  fileId: string,
): Promise<void> {
  const record = await prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { blobPath: true },
  });
  if (!record) return;

  try {
    const container = await getContainer();
    await container.getBlockBlobClient(record.blobPath).deleteIfExists();
  } catch {}

  await prisma.workspaceFile.delete({ where: { id: fileId } });
}

export async function getWorkspaceFileMeta(shop: string, fileId: string) {
  return prisma.workspaceFile.findFirst({
    where: { id: fileId, shop },
    select: { id: true, name: true, originalSize: true, charCount: true, createdAt: true },
  });
}
