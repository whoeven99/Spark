import type { ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient } from "@azure/storage-blob";

let containerPromise: Promise<ContainerClient> | null = null;

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

/** 与 AgentTask blob.translate-v4 / Spark AZURE_BLOB_TRANSLATION_CONTAINER 同一容器 */
export async function getTranslationBlobContainer(): Promise<ContainerClient> {
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(blobConnectionString());
      return service.getContainerClient(blobContainerName());
    })();
  }
  return containerPromise;
}

export async function translationBlobExists(blobPath: string): Promise<boolean> {
  const p = blobPath.trim();
  if (!p) return false;
  const container = await getTranslationBlobContainer();
  return container.getBlockBlobClient(p).exists();
}

/** 删除 Blob（不存在时静默跳过）；用于视觉任务历史清理。 */
export async function deleteTranslationBlobIfExists(blobPath: string): Promise<void> {
  const p = blobPath.trim();
  if (!p) return;
  try {
    const container = await getTranslationBlobContainer();
    const client = container.getBlockBlobClient(p);
    await client.deleteIfExists();
  } catch (e) {
    console.error(`[TranslationBlob] delete failed path=${p}`, e);
  }
}

export async function translationBlobSizeBytes(blobPath: string): Promise<number | null> {
  const p = blobPath.trim();
  if (!p) return null;
  try {
    const container = await getTranslationBlobContainer();
    const client = container.getBlockBlobClient(p);
    if (!(await client.exists())) return null;
    const props = await client.getProperties();
    return props.contentLength ?? null;
  } catch {
    return null;
  }
}

/** 仅读取前 maxBytes UTF-8 字节（与 Java readTextPrefix 一致） */
export async function translationBlobReadTextPrefix(
  blobPath: string,
  maxBytes: number,
): Promise<string | null> {
  const p = blobPath.trim();
  if (!p || maxBytes <= 0) return null;
  try {
    const container = await getTranslationBlobContainer();
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

export type TranslationBlobListEntry = {
  path: string;
  sizeBytes: number | null;
};

/** 解析连接串中的存储账户名（仅用于运维 UI 展示） */
export function getTranslationBlobMeta() {
  const conn = blobConnectionString();
  const container = blobContainerName();
  const match = /AccountName=([^;]+)/i.exec(conn);
  return {
    accountName: match?.[1]?.trim() ?? "",
    container,
  };
}

/** 列出某任务前缀下的 Blob（Init chunk、manifest 等） */
export async function listTranslationBlobPaths(
  prefix: string,
): Promise<TranslationBlobListEntry[]> {
  const p = prefix.trim();
  if (!p) return [];
  try {
    const container = await getTranslationBlobContainer();
    const out: TranslationBlobListEntry[] = [];
    for await (const item of container.listBlobsFlat({ prefix: p })) {
      const name = item.name?.trim();
      if (!name) continue;
      out.push({
        path: name,
        sizeBytes:
          typeof item.properties.contentLength === "number"
            ? item.properties.contentLength
            : null,
      });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  } catch (e) {
    console.error("[TranslationBlob] list failed", { prefix: p, error: e });
    return [];
  }
}

export async function translationBlobReadTextFull(blobPath: string): Promise<string | null> {
  const p = blobPath.trim();
  if (!p) return null;
  try {
    const container = await getTranslationBlobContainer();
    const client = container.getBlockBlobClient(p);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
