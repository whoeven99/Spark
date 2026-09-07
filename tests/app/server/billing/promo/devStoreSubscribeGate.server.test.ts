import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchShopBasicInfo = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo,
}));
vi.mock("../../../../../app/db.server", () => ({
  default: {
    devStoreSubscribeAllowlist: { findUnique },
  },
}));

import {
  DEV_STORE_REFERRAL_ERROR,
  isDevStoreReferralBlocked,
  resolveReferralCodeForCheckout,
  shouldBlockDevStoreReferral,
} from "../../../../../app/server/billing/promo/devStoreSubscribeGate.server";

const ADMIN = { graphql: vi.fn() };
const SHOP = "demo-store.myshopify.com";

describe("shouldBlockDevStoreReferral", () => {
  it("真店放行", () => {
    expect(
      shouldBlockDevStoreReferral({
        shopInfoOk: true,
        partnerDevelopment: false,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("店铺信息失败时放行", () => {
    expect(
      shouldBlockDevStoreReferral({
        shopInfoOk: false,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("开发店拦截推荐码", () => {
    expect(
      shouldBlockDevStoreReferral({
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(true);
  });

  it("白名单开发店放行", () => {
    expect(
      shouldBlockDevStoreReferral({
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: true,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("开发店域名无法规范化则拦截推荐码", () => {
    expect(
      shouldBlockDevStoreReferral({
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: false,
      }),
    ).toBe(true);
  });
});

describe("isDevStoreReferralBlocked", () => {
  beforeEach(() => {
    fetchShopBasicInfo.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("真店放行", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: false });
    await expect(
      isDevStoreReferralBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("开发店拦截推荐码", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    await expect(
      isDevStoreReferralBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(true);
    expect(fetchShopBasicInfo).toHaveBeenCalledWith(ADMIN);
    expect(findUnique).toHaveBeenCalledWith({
      where: { shop: SHOP },
      select: { id: true },
    });
  });

  it("白名单开发店放行", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    findUnique.mockResolvedValue({ id: "allow-1" });
    await expect(
      isDevStoreReferralBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });

  it("Shopify 查询失败放行", async () => {
    fetchShopBasicInfo.mockRejectedValue(new Error("graphql down"));
    await expect(
      isDevStoreReferralBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });

  it("Shopify 无 shop 放行", async () => {
    fetchShopBasicInfo.mockResolvedValue(null);
    await expect(
      isDevStoreReferralBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });
});

describe("resolveReferralCodeForCheckout", () => {
  beforeEach(() => {
    fetchShopBasicInfo.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("开发店带码则抛 DEV_STORE_REFERRAL_BLOCKED", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    await expect(
      resolveReferralCodeForCheckout({
        admin: ADMIN,
        shop: SHOP,
        rawCode: "SPARK-ABC123",
      }),
    ).rejects.toMatchObject({
      name: "BillingError",
      code: DEV_STORE_REFERRAL_ERROR.BLOCKED,
    });
  });

  it("开发店无码则返回空串，允许普通订阅", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    await expect(
      resolveReferralCodeForCheckout({
        admin: ADMIN,
        shop: SHOP,
        rawCode: "  ",
      }),
    ).resolves.toBe("");
  });

  it("真店带码原样返回", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: false });
    await expect(
      resolveReferralCodeForCheckout({
        admin: ADMIN,
        shop: SHOP,
        rawCode: " SPARK-ABC123 ",
      }),
    ).resolves.toBe(" SPARK-ABC123 ");
  });

  it("白名单开发店带码原样返回", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    findUnique.mockResolvedValue({ id: "allow-1" });
    await expect(
      resolveReferralCodeForCheckout({
        admin: ADMIN,
        shop: SHOP,
        rawCode: "SPARK-ABC123",
      }),
    ).resolves.toBe("SPARK-ABC123");
  });
});
