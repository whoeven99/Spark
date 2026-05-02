import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AdAuthProvider = "google" | "tiktok" | "microsoft";

type GoogleCredential = {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  customerId: string;
  updatedAt: string;
};

type TikTokCredential = {
  appId: string;
  appSecret: string;
  advertiserId: string;
  updatedAt: string;
};

type MicrosoftCredential = {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  customerId: string;
  updatedAt: string;
};

type ProviderCredential = GoogleCredential | TikTokCredential | MicrosoftCredential;
type CredentialStore = Record<string, Partial<Record<AdAuthProvider, ProviderCredential>>>;

const STORE_DIR = path.resolve(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "ad-auth-credentials.json");

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

export async function setGoogleCredential(
  shop: string,
  clientId: string,
  clientSecret: string,
  developerToken: string,
  customerId: string,
) {
  const store = await readStore();
  if (!store[shop]) store[shop] = {};
  store[shop].google = {
    clientId,
    clientSecret,
    developerToken,
    customerId,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function getGoogleCredential(shop: string) {
  const store = await readStore();
  return (store[shop]?.google as GoogleCredential | undefined) ?? null;
}

export async function setTikTokCredential(
  shop: string,
  appId: string,
  appSecret: string,
  advertiserId: string,
) {
  const store = await readStore();
  if (!store[shop]) store[shop] = {};
  store[shop].tiktok = {
    appId,
    appSecret,
    advertiserId,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function getTikTokCredential(shop: string) {
  const store = await readStore();
  return (store[shop]?.tiktok as TikTokCredential | undefined) ?? null;
}

export async function setMicrosoftCredential(
  shop: string,
  clientId: string,
  clientSecret: string,
  developerToken: string,
  customerId: string,
) {
  const store = await readStore();
  if (!store[shop]) store[shop] = {};
  store[shop].microsoft = {
    clientId,
    clientSecret,
    developerToken,
    customerId,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function getMicrosoftCredential(shop: string) {
  const store = await readStore();
  return (store[shop]?.microsoft as MicrosoftCredential | undefined) ?? null;
}

export function maskToken(value: string) {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

