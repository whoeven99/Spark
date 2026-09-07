import { beforeEach, describe, expect, it, vi } from "vitest";

const isProductionNodeEnv = vi.hoisted(() => vi.fn(() => false));
const fetchShopBasicInfo = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../../../../../app/config/nodeEnv.server", () => ({
  isProductionNodeEnv,
}));
vi.mock("../../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo,
}));
vi.mock("../../../../../app/db.server", () => ({
  default: {
    devStoreSubscribeAllowlist: { findUnique },
  },
}));

import {
  assertDevStoreCanSubscribe,
  DEV_STORE_SUBSCRIBE_ERROR,
  isDevStoreSubscribeBlocked,
  shouldBlockDevStoreSubscribe,
} from "../../../../../app/server/billing/promo/devStoreSubscribeGate.server";

const ADMIN = { graphql: vi.fn() };
const SHOP = "demo-store.myshopify.com";

describe("shouldBlockDevStoreSubscribe", () => {
  it("非 prod 放行", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: false,
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("真店放行", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: true,
        shopInfoOk: true,
        partnerDevelopment: false,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("店铺信息失败时放行", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: true,
        shopInfoOk: false,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("开发店拦截", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: true,
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: true,
      }),
    ).toBe(true);
  });

  it("白名单开发店放行", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: true,
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: true,
        shopDomainOk: true,
      }),
    ).toBe(false);
  });

  it("开发店域名无法规范化则拦截", () => {
    expect(
      shouldBlockDevStoreSubscribe({
        isProduction: true,
        shopInfoOk: true,
        partnerDevelopment: true,
        allowlisted: false,
        shopDomainOk: false,
      }),
    ).toBe(true);
  });
});

describe("isDevStoreSubscribeBlocked", () => {
  beforeEach(() => {
    isProductionNodeEnv.mockReset();
    isProductionNodeEnv.mockReturnValue(true);
    fetchShopBasicInfo.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("非正式环境直接放行且不查 Shopify", async () => {
    isProductionNodeEnv.mockReturnValue(false);
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
    expect(fetchShopBasicInfo).not.toHaveBeenCalled();
  });

  it("真店放行", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: false });
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("开发店拦截", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { shop: SHOP },
      select: { id: true },
    });
  });

  it("白名单开发店放行", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    findUnique.mockResolvedValue({ id: "allow-1" });
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });

  it("Shopify 查询失败放行", async () => {
    fetchShopBasicInfo.mockRejectedValue(new Error("graphql down"));
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });

  it("Shopify 无 shop 放行", async () => {
    fetchShopBasicInfo.mockResolvedValue(null);
    await expect(
      isDevStoreSubscribeBlocked({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBe(false);
  });
});

describe("assertDevStoreCanSubscribe", () => {
  beforeEach(() => {
    isProductionNodeEnv.mockReset();
    isProductionNodeEnv.mockReturnValue(true);
    fetchShopBasicInfo.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("拦截时抛 DEV_STORE_SUBSCRIBE_BLOCKED", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: true });
    await expect(
      assertDevStoreCanSubscribe({ admin: ADMIN, shop: SHOP }),
    ).rejects.toMatchObject({
      name: "BillingError",
      code: DEV_STORE_SUBSCRIBE_ERROR.BLOCKED,
    });
  });

  it("放行时不抛", async () => {
    fetchShopBasicInfo.mockResolvedValue({ partnerDevelopment: false });
    await expect(
      assertDevStoreCanSubscribe({ admin: ADMIN, shop: SHOP }),
    ).resolves.toBeUndefined();
  });
});
