import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

let _container: ContainerClient | null = null;

function getContainer(): ContainerClient {
  if (_container) return _container;
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("Blob not configured: set AZURE_BLOB_CONNECTION_STRING");
  const containerName =
    process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content";
  _container = BlobServiceClient.fromConnectionString(conn).getContainerClient(containerName);
  return _container;
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.AZURE_BLOB_CONNECTION_STRING?.trim());
}

export async function blobRead<T = unknown>(blobPath: string): Promise<T | null> {
  try {
    const client = getContainer().getBlockBlobClient(blobPath);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function blobWrite(blobPath: string, content: unknown): Promise<void> {
  const text = JSON.stringify(content, null, 2);
  const client = getContainer().getBlockBlobClient(blobPath);
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}
