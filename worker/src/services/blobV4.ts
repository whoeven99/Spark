import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

let _container: ContainerClient | null = null;
let _containerReady: Promise<void> | null = null;

function getContainer(): ContainerClient {
  if (_container) return _container;
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("Blob not configured: set AZURE_BLOB_CONNECTION_STRING");
  const containerName =
    process.env.AZURE_BLOB_TRANSLATION_CONTAINER?.trim() || "translation-content";
  _container = BlobServiceClient.fromConnectionString(conn).getContainerClient(containerName);
  return _container;
}

/** 首次写入前确保容器存在（幂等）。 */
async function ensureContainer(): Promise<void> {
  if (!_containerReady) {
    _containerReady = getContainer()
      .createIfNotExists()
      .then(() => undefined)
      .catch((err) => {
        _containerReady = null;
        throw err;
      });
  }
  await _containerReady;
}

export async function blobWrite(path: string, content: unknown): Promise<void> {
  await ensureContainer();
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

/** Delete a single blob. No-op if it doesn't exist. */
export async function blobDelete(path: string): Promise<void> {
  try {
    await getContainer().getBlockBlobClient(path).deleteIfExists();
  } catch {
    // best-effort
  }
}
