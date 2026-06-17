import prisma from "../../db.server";

// Catalog credentials live in the same `AdPlatformCredential` table as ads
// auth credentials, but use dedicated platform keys so they don't collide
// with Meta/Google Ads OAuth records that are stored elsewhere.
const META_CATALOG_PLATFORM = "meta_catalog";
const GOOGLE_MERCHANT_PLATFORM = "google_merchant";

export type FacebookCatalogCredential = {
  accessToken: string;
  catalogId: string;
  businessId?: string;
  apiVersion?: string;
  updatedAt: string;
};

export type GoogleMerchantCredential = {
  /** OAuth2 access token (short-lived). */
  accessToken: string;
  /** OAuth2 refresh token used to mint new access tokens. */
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  merchantId: string;
  updatedAt: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readPlatformCredential(
  shop: string,
  platform: string,
): Promise<{ data: Record<string, unknown>; updatedAt: Date } | null> {
  const row = await prisma.adPlatformCredential.findUnique({
    where: { shop_platform: { shop, platform } },
  });
  if (!row || !isJsonObject(row.credentials)) return null;
  return { data: row.credentials, updatedAt: row.updatedAt };
}

async function writePlatformCredential(
  shop: string,
  platform: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.adPlatformCredential.upsert({
    where: { shop_platform: { shop, platform } },
    update: { credentials: payload },
    create: { shop, platform, credentials: payload },
  });
}

// ─── Facebook catalog ───────────────────────────────────────────────────────

export async function getFacebookCatalogCredential(
  shop: string,
): Promise<FacebookCatalogCredential | null> {
  const record = await readPlatformCredential(shop, META_CATALOG_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const catalogId = String(record.data.catalogId ?? "");
  if (!accessToken || !catalogId) return null;
  return {
    accessToken,
    catalogId,
    businessId:
      typeof record.data.businessId === "string" ? record.data.businessId : undefined,
    apiVersion:
      typeof record.data.apiVersion === "string" ? record.data.apiVersion : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setFacebookCatalogCredential(
  shop: string,
  payload: Pick<FacebookCatalogCredential, "accessToken" | "catalogId" | "businessId" | "apiVersion">,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const catalogId = payload.catalogId.trim();
  if (!accessToken || !catalogId) {
    throw new Error("Facebook catalog accessToken and catalogId are required");
  }
  await writePlatformCredential(shop, META_CATALOG_PLATFORM, {
    accessToken,
    catalogId,
    businessId: payload.businessId?.trim() || null,
    apiVersion: payload.apiVersion?.trim() || null,
  });
}

// ─── Google Merchant Center ─────────────────────────────────────────────────

export async function getGoogleMerchantCredential(
  shop: string,
): Promise<GoogleMerchantCredential | null> {
  const record = await readPlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const merchantId = String(record.data.merchantId ?? "");
  if (!accessToken || !merchantId) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string"
        ? record.data.refreshToken
        : undefined,
    clientId:
      typeof record.data.clientId === "string" ? record.data.clientId : undefined,
    clientSecret:
      typeof record.data.clientSecret === "string"
        ? record.data.clientSecret
        : undefined,
    merchantId,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setGoogleMerchantCredential(
  shop: string,
  payload: Pick<
    GoogleMerchantCredential,
    "accessToken" | "refreshToken" | "clientId" | "clientSecret" | "merchantId"
  >,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const merchantId = payload.merchantId.trim();
  if (!accessToken || !merchantId) {
    throw new Error("Google Merchant accessToken and merchantId are required");
  }
  await writePlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM, {
    accessToken,
    refreshToken: payload.refreshToken?.trim() || null,
    clientId: payload.clientId?.trim() || null,
    clientSecret: payload.clientSecret?.trim() || null,
    merchantId,
  });
}

export function maskTokenTail(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
