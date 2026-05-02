import prisma from "../db.server";

export type AdAuthProvider = "meta" | "google" | "tiktok" | "microsoft";

type CredentialPayloadByProvider = {
  meta: {
    clientId: string;
    clientSecret: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    developerToken: string;
    customerId: string;
  };
  tiktok: {
    appId: string;
    appSecret: string;
    advertiserId: string;
  };
  microsoft: {
    clientId: string;
    clientSecret: string;
    developerToken: string;
    customerId: string;
  };
};

type WithUpdatedAt<T extends Record<string, unknown>> = T & { updatedAt: string };
type MetaCredential = WithUpdatedAt<CredentialPayloadByProvider["meta"]>;
type GoogleCredential = WithUpdatedAt<CredentialPayloadByProvider["google"]>;
type TikTokCredential = WithUpdatedAt<CredentialPayloadByProvider["tiktok"]>;
type MicrosoftCredential = WithUpdatedAt<CredentialPayloadByProvider["microsoft"]>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function setProviderCredential<K extends AdAuthProvider>(
  shop: string,
  provider: K,
  payload: CredentialPayloadByProvider[K],
) {
  await prisma.adPlatformCredential.upsert({
    where: {
      shop_platform: {
        shop,
        platform: provider,
      },
    },
    update: {
      credentials: payload,
    },
    create: {
      shop,
      platform: provider,
      credentials: payload,
    },
  });
}

async function getProviderCredential<K extends AdAuthProvider>(
  shop: string,
  provider: K,
): Promise<WithUpdatedAt<CredentialPayloadByProvider[K]> | null> {
  const record = await prisma.adPlatformCredential.findUnique({
    where: {
      shop_platform: {
        shop,
        platform: provider,
      },
    },
  });
  if (!record || !isJsonObject(record.credentials)) return null;

  return {
    ...(record.credentials as CredentialPayloadByProvider[K]),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setGoogleCredential(
  shop: string,
  clientId: string,
  clientSecret: string,
  developerToken: string,
  customerId: string,
) {
  await setProviderCredential(shop, "google", {
    clientId,
    clientSecret,
    developerToken,
    customerId,
  });
}

export async function getGoogleCredential(shop: string) {
  return getProviderCredential(shop, "google") as Promise<GoogleCredential | null>;
}

export async function setTikTokCredential(
  shop: string,
  appId: string,
  appSecret: string,
  advertiserId: string,
) {
  await setProviderCredential(shop, "tiktok", {
    appId,
    appSecret,
    advertiserId,
  });
}

export async function getTikTokCredential(shop: string) {
  return getProviderCredential(shop, "tiktok") as Promise<TikTokCredential | null>;
}

export async function setMicrosoftCredential(
  shop: string,
  clientId: string,
  clientSecret: string,
  developerToken: string,
  customerId: string,
) {
  await setProviderCredential(shop, "microsoft", {
    clientId,
    clientSecret,
    developerToken,
    customerId,
  });
}

export async function getMicrosoftCredential(shop: string) {
  return getProviderCredential(shop, "microsoft") as Promise<MicrosoftCredential | null>;
}

export async function setMetaCredential(shop: string, clientId: string, clientSecret: string) {
  await setProviderCredential(shop, "meta", {
    clientId,
    clientSecret,
  });
}

export async function getMetaCredential(shop: string) {
  return getProviderCredential(shop, "meta") as Promise<MetaCredential | null>;
}

export function maskToken(value: string) {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

