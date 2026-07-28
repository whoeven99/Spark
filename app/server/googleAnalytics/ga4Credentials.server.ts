import prisma from "../../db.server";

const GA4_PLATFORM = "google_analytics";
const GA4_PENDING_PLATFORM = "google_analytics_pending";

export type Ga4Credential = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  propertyId: string;
  propertyName: string;
  updatedAt: string;
};

export type Ga4PendingCredential = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  properties: Array<{ propertyId: string; propertyName: string; accountName: string }>;
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

async function deletePlatformCredential(shop: string, platform: string): Promise<void> {
  await prisma.adPlatformCredential
    .delete({ where: { shop_platform: { shop, platform } } })
    .catch(() => undefined);
}

// ─── GA4 confirmed credential ──────────────────────────────────────────────────

export async function getGa4Credential(shop: string): Promise<Ga4Credential | null> {
  const row = await readPlatformCredential(shop, GA4_PLATFORM);
  if (!row) return null;
  const d = row.data;
  if (
    typeof d.accessToken !== "string" ||
    typeof d.propertyId !== "string" ||
    typeof d.propertyName !== "string"
  )
    return null;
  return {
    accessToken: d.accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    clientId: typeof d.clientId === "string" ? d.clientId : undefined,
    clientSecret: typeof d.clientSecret === "string" ? d.clientSecret : undefined,
    propertyId: d.propertyId,
    propertyName: d.propertyName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setGa4Credential(
  shop: string,
  payload: Omit<Ga4Credential, "updatedAt">,
): Promise<void> {
  await writePlatformCredential(shop, GA4_PLATFORM, {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteGa4Credential(shop: string): Promise<void> {
  await deletePlatformCredential(shop, GA4_PLATFORM);
}

// ─── GA4 pending credential (property selection) ──────────────────────────────

export async function getGa4Pending(shop: string): Promise<Ga4PendingCredential | null> {
  const row = await readPlatformCredential(shop, GA4_PENDING_PLATFORM);
  if (!row) return null;
  const d = row.data;
  if (typeof d.accessToken !== "string" || !Array.isArray(d.properties)) return null;
  return {
    accessToken: d.accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    clientId: typeof d.clientId === "string" ? d.clientId : undefined,
    clientSecret: typeof d.clientSecret === "string" ? d.clientSecret : undefined,
    properties: (d.properties as Array<Record<string, unknown>>).map((p) => ({
      propertyId: String(p.propertyId ?? ""),
      propertyName: String(p.propertyName ?? ""),
      accountName: String(p.accountName ?? ""),
    })),
  };
}

export async function setGa4Pending(
  shop: string,
  payload: Ga4PendingCredential,
): Promise<void> {
  await writePlatformCredential(
    shop,
    GA4_PENDING_PLATFORM,
    payload as unknown as Record<string, unknown>,
  );
}

export async function clearGa4Pending(shop: string): Promise<void> {
  await deletePlatformCredential(shop, GA4_PENDING_PLATFORM);
}
