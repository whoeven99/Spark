import prisma from "../../../db.server";
import { BillingError } from "../errors.server";
import { hashShopDomain } from "./shopHash.server";
import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "./referralCodeFormat";
import { readReferralCodeFromRequest } from "./referralCookie.server";
import { savePendingReferralCode } from "./referralCode.server";

function isCodeActive(
  row: {
    enabled: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  now: Date,
): boolean {
  if (!row.enabled) return false;
  const ts = now.getTime();
  if (row.startsAt && ts < row.startsAt.getTime()) return false;
  if (row.endsAt && ts > row.endsAt.getTime()) return false;
  return true;
}

export async function isActiveReferralCode(rawCode: string): Promise<boolean> {
  const code = normalizeReferralCode(rawCode);
  if (!isValidReferralCodeFormat(code)) return false;
  const row = await prisma.referralCode.findUnique({
    where: { code },
    select: { enabled: true, startsAt: true, endsAt: true, tokenAmount: true },
  });
  return Boolean(row && row.tokenAmount > 0 && isCodeActive(row, new Date()));
}

/**
 * 带码安装链接落地后，在 OAuth / 进应用时记安装来源（先到先得）。
 * 不发 Token；只预填 pending，订阅确认后才入账。失败不抛给调用方。
 */
export async function captureReferralInstallFromRequest(
  shop: string,
  request: Request,
): Promise<boolean> {
  return captureReferralInstall(shop, readReferralCodeFromRequest(request));
}

export async function captureReferralInstall(
  shop: string,
  rawCode: string,
): Promise<boolean> {
  const normalizedShop = shop.trim();
  const code = normalizeReferralCode(rawCode);
  if (!normalizedShop || !isValidReferralCodeFormat(code)) return false;

  const shopHash = hashShopDomain(normalizedShop);
  const existing = await prisma.referralInstall.findUnique({
    where: { shopHash },
    select: { id: true, codeId: true, shop: true },
  });
  if (existing) {
    if (!existing.shop) {
      await prisma.referralInstall
        .update({
          where: { shopHash },
          data: { shop: normalizedShop },
        })
        .catch(() => undefined);
    }
    await seedPendingFromInstall(normalizedShop, existing.codeId);
    return false;
  }

  const row = await prisma.referralCode.findUnique({
    where: { code },
    select: {
      id: true,
      enabled: true,
      startsAt: true,
      endsAt: true,
      tokenAmount: true,
    },
  });
  if (!row || row.tokenAmount <= 0 || !isCodeActive(row, new Date())) {
    return false;
  }

  try {
    await prisma.referralInstall.create({
      data: {
        codeId: row.id,
        shopHash,
        shop: normalizedShop,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return false;
    }
    console.error("[ReferralInstall] create failed", error);
    return false;
  }

  await seedPendingFromCode(normalizedShop, code);
  return true;
}

async function seedPendingFromInstall(
  shop: string,
  codeId: string,
): Promise<void> {
  const row = await prisma.referralCode.findUnique({
    where: { id: codeId },
    select: { code: true },
  });
  if (!row) return;
  await seedPendingFromCode(shop, row.code);
}

async function seedPendingFromCode(shop: string, code: string): Promise<void> {
  try {
    await savePendingReferralCode(shop, code);
  } catch (error) {
    if (error instanceof BillingError) return;
    console.warn("[ReferralInstall] pending seed failed", error);
  }
}
