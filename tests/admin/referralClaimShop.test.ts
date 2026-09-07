import { describe, expect, it } from "vitest";
import { resolveReferralClaimShops } from "../../admin/server/lib/referralClaimShop";
import { hashShopDomain, normalizeShopDomain } from "../../admin/server/lib/shopHash";

const LIVE_SHOP = "demo-store.myshopify.com";
const LIVE_HASH = hashShopDomain(LIVE_SHOP);

describe("shopHash", () => {
  it("规范化后再哈希，与主应用算法一致", () => {
    expect(normalizeShopDomain("https://Demo-Store.myshopify.com/")).toBe(LIVE_SHOP);
    expect(hashShopDomain("https://Demo-Store.myshopify.com/")).toBe(LIVE_HASH);
    expect(LIVE_HASH).toHaveLength(64);
  });
});

describe("resolveReferralClaimShops", () => {
  const claim = {
    shopHash: LIVE_HASH,
    tokensDelta: 1_000_000,
    claimedAt: "2026-09-01T00:00:00.000Z",
  };

  it("优先用 BillingLog.shop，不依赖 json_extract", () => {
    const items = resolveReferralClaimShops({
      claims: [claim],
      billingLogShops: [`https://${LIVE_SHOP}/`],
      installShopsByHash: new Map(),
      accountShops: [],
    });
    expect(items[0]?.shop).toBe(`https://${LIVE_SHOP}/`);
  });

  it("BillingLog 没有时回退 ReferralInstall.shop", () => {
    const items = resolveReferralClaimShops({
      claims: [claim],
      billingLogShops: [],
      installShopsByHash: new Map([[LIVE_HASH, LIVE_SHOP]]),
      accountShops: [],
    });
    expect(items[0]?.shop).toBe(LIVE_SHOP);
  });

  it("再回退仍在装的 Account.shop", () => {
    const items = resolveReferralClaimShops({
      claims: [claim],
      billingLogShops: [],
      installShopsByHash: new Map([[LIVE_HASH, null]]),
      accountShops: [LIVE_SHOP],
    });
    expect(items[0]?.shop).toBe(LIVE_SHOP);
  });

  it("三处都没有则 shop 为 null，并给出 hash 前 8 位", () => {
    const items = resolveReferralClaimShops({
      claims: [claim],
      billingLogShops: [],
      installShopsByHash: new Map(),
      accountShops: ["other.myshopify.com"],
    });
    expect(items[0]?.shop).toBeNull();
    expect(items[0]?.shopHashShort).toBe(LIVE_HASH.slice(0, 8));
  });
});
