import prisma from "../../../db.server";
import { hashShopDomain } from "./shopHash.server";

export async function hasPromoClaimLedgerEntry(
  shop: string,
  campaignId: string,
): Promise<boolean> {
  const shopHash = hashShopDomain(shop);
  const row = await prisma.promoClaimLedger.findUnique({
    where: {
      shopHash_campaignId: { shopHash, campaignId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** 写入领取账本；已存在则返回 alreadyClaimed。 */
export async function recordPromoClaimLedger(params: {
  shop: string;
  campaignId: string;
  tokensDelta: number;
}): Promise<{ alreadyClaimed: boolean }> {
  const shopHash = hashShopDomain(params.shop);
  try {
    await prisma.promoClaimLedger.create({
      data: {
        shopHash,
        campaignId: params.campaignId,
        tokensDelta: params.tokensDelta,
      },
    });
    return { alreadyClaimed: false };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "P2002") {
      return { alreadyClaimed: true };
    }
    throw error;
  }
}
