import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AdProvider = "meta";

type CredentialRecord = {
  clientId: string;
  clientSecret: string;
  updatedAt: string;
};

type CredentialStore = Record<string, Record<string, CredentialRecord>>;

const STORE_DIR = path.resolve(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "ad-provider-credentials.json");

async function readStore(): Promise<CredentialStore> {
  try {
    const content = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(content) as CredentialStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: CredentialStore) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function setAdProviderCredential(
  shop: string,
  provider: AdProvider,
  clientId: string,
  clientSecret: string,
) {
  const store = await readStore();
  if (!store[shop]) {
    store[shop] = {};
  }
  store[shop][provider] = {
    clientId,
    clientSecret,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function getAdProviderCredential(shop: string, provider: AdProvider) {
  const store = await readStore();
  return store[shop]?.[provider] ?? null;
}

export function maskClientId(clientId: string) {
  if (!clientId) return "";
  if (clientId.length <= 6) return `${clientId.slice(0, 1)}***`;
  return `${clientId.slice(0, 3)}***${clientId.slice(-3)}`;
}

