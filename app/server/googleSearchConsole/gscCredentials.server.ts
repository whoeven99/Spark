import prisma from "../../db.server";
import type { Prisma } from "../../generated/prisma";

const GSC_PLATFORM = "google_search_console";
const GSC_PENDING_PLATFORM = "google_search_console_pending";

export type GscCredential = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  siteUrl: string;
  updatedAt: string;
};

export type GscPendingCredential = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  sites: Array<{ siteUrl: string; permissionLevel: string }>;
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
    update: { credentials: payload as Prisma.InputJsonValue },
    create: { shop, platform, credentials: payload as Prisma.InputJsonValue },
  });
}

async function deletePlatformCredential(shop: string, platform: string): Promise<void> {
  await prisma.adPlatformCredential
    .delete({ where: { shop_platform: { shop, platform } } })
    .catch(() => undefined);
}

// ─── GSC confirmed credential ─────────────────────────────────────────────────

export async function getGscCredential(shop: string): Promise<GscCredential | null> {
  const row = await readPlatformCredential(shop, GSC_PLATFORM);
  if (!row) return null;
  const d = row.data;
  if (typeof d.accessToken !== "string" || typeof d.siteUrl !== "string") return null;
  return {
    accessToken: d.accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    clientId: typeof d.clientId === "string" ? d.clientId : undefined,
    clientSecret: typeof d.clientSecret === "string" ? d.clientSecret : undefined,
    siteUrl: d.siteUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setGscCredential(
  shop: string,
  payload: Omit<GscCredential, "updatedAt">,
): Promise<void> {
  await writePlatformCredential(shop, GSC_PLATFORM, {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteGscCredential(shop: string): Promise<void> {
  await deletePlatformCredential(shop, GSC_PLATFORM);
}

// ─── GSC pending credential (site selection) ──────────────────────────────────

export async function getGscPending(shop: string): Promise<GscPendingCredential | null> {
  const row = await readPlatformCredential(shop, GSC_PENDING_PLATFORM);
  if (!row) return null;
  const d = row.data;
  if (typeof d.accessToken !== "string" || !Array.isArray(d.sites)) return null;
  return {
    accessToken: d.accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    clientId: typeof d.clientId === "string" ? d.clientId : undefined,
    clientSecret: typeof d.clientSecret === "string" ? d.clientSecret : undefined,
    sites: (d.sites as Array<Record<string, unknown>>).map((s) => ({
      siteUrl: String(s.siteUrl ?? ""),
      permissionLevel: String(s.permissionLevel ?? "siteOwner"),
    })),
  };
}

export async function setGscPending(
  shop: string,
  payload: GscPendingCredential,
): Promise<void> {
  await writePlatformCredential(shop, GSC_PENDING_PLATFORM, payload as unknown as Record<string, unknown>);
}

export async function clearGscPending(shop: string): Promise<void> {
  await deletePlatformCredential(shop, GSC_PENDING_PLATFORM);
}
