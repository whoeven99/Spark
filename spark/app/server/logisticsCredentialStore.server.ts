import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LogisticsProvider = "sf";

type SfCredentialRecord = {
  customerCode: string;
  checkWord: string;
  monthlyAccount: string;
  updatedAt: string;
};

type CredentialStore = Record<string, Record<string, SfCredentialRecord>>;

const STORE_DIR = path.resolve(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "logistics-provider-credentials.json");

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

export async function setSfCredential(
  shop: string,
  customerCode: string,
  checkWord: string,
  monthlyAccount: string,
) {
  const store = await readStore();
  if (!store[shop]) {
    store[shop] = {};
  }
  store[shop].sf = {
    customerCode,
    checkWord,
    monthlyAccount,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function getSfCredential(shop: string) {
  const store = await readStore();
  return store[shop]?.sf ?? null;
}

export function maskCustomerCode(customerCode: string) {
  if (!customerCode) return "";
  if (customerCode.length <= 6) return `${customerCode.slice(0, 1)}***`;
  return `${customerCode.slice(0, 3)}***${customerCode.slice(-3)}`;
}

