import { hashShopDomain } from "./shopHash.js";

export type ReferralClaimRow = {
  shopHash: string;
  tokensDelta: number;
  claimedAt: string | null;
};

export type ReferralClaimShopItem = ReferralClaimRow & {
  shopHashShort: string;
  shop: string | null;
};

export function shopsByHash(
  shops: Array<string | null | undefined>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const shop of shops) {
    const trimmed = typeof shop === "string" ? shop.trim() : "";
    if (!trimmed) continue;
    const hash = hashShopDomain(trimmed);
    if (!map.has(hash)) map.set(hash, trimmed);
  }
  return map;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

/** BillingLog.shop → ReferralInstall.shop → Account.shop；都没有则视为已卸载。 */
export function resolveReferralClaimShops(params: {
  claims: ReferralClaimRow[];
  billingLogShops: Array<string | null | undefined>;
  installShopsByHash: Map<string, string | null>;
  accountShops: Array<string | null | undefined>;
}): ReferralClaimShopItem[] {
  const fromBilling = shopsByHash(params.billingLogShops);
  const fromAccount = shopsByHash(params.accountShops);
  return params.claims.map((claim) => ({
    ...claim,
    shopHashShort: claim.shopHash.slice(0, 8),
    shop: firstNonEmpty(
      fromBilling.get(claim.shopHash),
      params.installShopsByHash.get(claim.shopHash),
      fromAccount.get(claim.shopHash),
    ),
  }));
}
