import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());
const getGoogleMerchantProduct = vi.hoisted(() => vi.fn());
const refreshGoogleAccessToken = vi.hoisted(() => vi.fn());
const getGoogleMerchantCredential = vi.hoisted(() => vi.fn());
const setGoogleMerchantCredential = vi.hoisted(() => vi.fn());
const findShopByGmcMerchantId = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/db.server", () => ({
  default: {
    gmcProductStatus: {
      upsert: (...args: unknown[]) => upsert(...args),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("../../../../app/server/adsCatalog/clients/googleMerchantClient.server", () => ({
  getGoogleMerchantProduct: (...args: unknown[]) =>
    getGoogleMerchantProduct(...args),
  refreshGoogleAccessToken: (...args: unknown[]) =>
    refreshGoogleAccessToken(...args),
}));
vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getGoogleMerchantCredential: (...args: unknown[]) =>
    getGoogleMerchantCredential(...args),
  setGoogleMerchantCredential: (...args: unknown[]) =>
    setGoogleMerchantCredential(...args),
  setGmcSubscriptionName: vi.fn(),
  findShopByGmcMerchantId: (...args: unknown[]) => findShopByGmcMerchantId(...args),
}));

import {
  handleGmcProductStatusNotification,
  parseGmcNotificationBody,
} from "../../../../app/server/adsCatalog/gmcNotifications.server";

const notification = {
  account: "accounts/123",
  resourceId: "online~en~US~SKU-1",
  changes: [{ oldValue: "pending", newValue: "approved" }],
};

describe("Merchant Notifications v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findShopByGmcMerchantId.mockResolvedValue("shop.myshopify.com");
    upsert.mockResolvedValue(undefined);
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      merchantId: "123",
    });
    refreshGoogleAccessToken.mockResolvedValue({
      accessToken: "new-token",
      expiresIn: 3600,
    });
    getGoogleMerchantProduct.mockResolvedValue({
      offerId: "SKU-1",
      contentLanguage: "en",
      feedLabel: "US",
      productAttributes: { title: "Product" },
      productStatus: {
        destinationStatuses: [{ approvedCountries: ["US"] }],
        itemLevelIssues: [],
      },
    });
  });

  it("解析直接通知和 Pub/Sub envelope", () => {
    expect(parseGmcNotificationBody(notification)).toMatchObject(notification);
    const data = Buffer.from(JSON.stringify(notification)).toString("base64");
    expect(parseGmcNotificationBody({ message: { data } })).toMatchObject(
      notification,
    );
  });

  it("刷新 token 后持久化，并按市场复合键回填状态", async () => {
    await handleGmcProductStatusNotification(notification);

    // 反查走索引列，不再扫全表解 JSON。
    expect(findShopByGmcMerchantId).toHaveBeenCalledWith("123");
    expect(setGoogleMerchantCredential).toHaveBeenCalledWith(
      "shop.myshopify.com",
      expect.objectContaining({ accessToken: "new-token", merchantId: "123" }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shop_offerId_contentLanguage_feedLabel: {
            shop: "shop.myshopify.com",
            offerId: "SKU-1",
            contentLanguage: "en",
            feedLabel: "US",
          },
        },
      }),
    );
  });
});
