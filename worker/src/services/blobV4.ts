import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

let _container: ContainerClient | null = null;

function getContainer(): ContainerClient {
  if (_container) return _container;
  const conn =
    process.env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim() ||
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("Blob not configured: set AZURE_BLOB_CONNECTION_STRING");
  const containerName =
    process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content";
  _container = BlobServiceClient.fromConnectionString(conn).getContainerClient(containerName);
  return _container;
}

export async function blobWrite(path: string, content: unknown): Promise<void> {
  const text = JSON.stringify(content, null, 2);
  const client = getContainer().getBlockBlobClient(path);
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

export async function blobRead<T = unknown>(path: string): Promise<T | null> {
  try {
    const client = getContainer().getBlockBlobClient(path);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function blobExists(path: string): Promise<boolean> {
  try {
    return await getContainer().getBlockBlobClient(path).exists();
  } catch {
    return false;
  }
}

/** List blob paths under a prefix */
export async function blobListPaths(prefix: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    for await (const item of getContainer().listBlobsFlat({ prefix })) {
      paths.push(item.name);
    }
  } catch {
    // return what we have
  }
  return paths;
}
