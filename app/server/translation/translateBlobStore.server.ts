import type { ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient } from "@azure/storage-blob";

let containerPromise: Promise<ContainerClient> | null = null;

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

/** 与 BogdaRepository TranslateV3BlobConfig 同一容器 */
export async function getTranslateV3BlobContainer(): Promise<ContainerClient> {
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(blobConnectionString());
      return service.getContainerClient(blobContainerName());
    })();
  }
  return containerPromise;
}

export async function translateV3BlobExists(blobPath: string): Promise<boolean> {
  const p = blobPath.trim();
  if (!p) return false;
  const container = await getTranslateV3BlobContainer();
  return container.getBlockBlobClient(p).exists();
}

export async function translateV3BlobSizeBytes(blobPath: string): Promise<number | null> {
  const p = blobPath.trim();
  if (!p) return null;
  try {
    const container = await getTranslateV3BlobContainer();
    const client = container.getBlockBlobClient(p);
    if (!(await client.exists())) return null;
    const props = await client.getProperties();
    return props.contentLength ?? null;
  } catch {
    return null;
  }
}

/** 仅读取前 maxBytes UTF-8 字节（与 Java readTextPrefix 一致） */
export async function translateV3ReadTextPrefix(
  blobPath: string,
  maxBytes: number,
): Promise<string | null> {
  const p = blobPath.trim();
  if (!p || maxBytes <= 0) return null;
  try {
    const container = await getTranslateV3BlobContainer();
    const client = container.getBlockBlobClient(p);
    if (!(await client.exists())) return null;
    const download = await client.download(0, maxBytes);
    const stream = download.readableStreamBody;
    if (!stream) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return null;
  }
}

export async function translateV3ReadTextFull(blobPath: string): Promise<string | null> {
  const p = blobPath.trim();
  if (!p) return null;
  try {
    const container = await getTranslateV3BlobContainer();
    const client = container.getBlockBlobClient(p);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
