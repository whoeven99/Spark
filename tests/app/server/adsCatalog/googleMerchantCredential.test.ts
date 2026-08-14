import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/db.server", () => ({
  default: {
    adPlatformCredential: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

import {
  setGoogleAdsCredential,
  setGoogleMerchantCredential,
} from "../../../../app/server/adsCatalog/credentialStore.server";

describe("Google Merchant credential merge", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue(undefined);
  });

  it("preserves subscription and data source when refreshing the same merchant", async () => {
    findUnique.mockResolvedValue({
      credentials: {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        clientId: "client-id",
        clientSecret: "client-secret",
        merchantId: "123",
        subscriptionName: "accounts/123/notificationsubscriptions/456",
        dataSourceName: "accounts/123/dataSources/789",
        dataSourceContentLanguage: "en",
        dataSourceFeedLabel: "US",
      },
      updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    });

    await setGoogleMerchantCredential("shop.myshopify.com", {
      accessToken: "new-token",
      refreshToken: "refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      merchantId: "123",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          credentials: expect.objectContaining({
            accessToken: "new-token",
            subscriptionName: "accounts/123/notificationsubscriptions/456",
            dataSourceName: "accounts/123/dataSources/789",
          }),
          // merchantId 同步进索引列，供 GMC 通知反查店铺。
          externalAccountId: "123",
        }),
      }),
    );
  });

  it("does not carry account-bound fields to a different merchant", async () => {
    findUnique.mockResolvedValue({
      credentials: {
        accessToken: "old-token",
        merchantId: "123",
        subscriptionName: "accounts/123/notificationsubscriptions/456",
        dataSourceName: "accounts/123/dataSources/789",
      },
      updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    });

    await setGoogleMerchantCredential("shop.myshopify.com", {
      accessToken: "new-token",
      merchantId: "999",
    });

    const payload = upsert.mock.calls[0]?.[0]?.update?.credentials;
    expect(payload).toMatchObject({
      accessToken: "new-token",
      merchantId: "999",
      dataSourceName: null,
    });
    expect(payload).not.toHaveProperty("subscriptionName");
  });

  it("Google Ads token 刷新保留再营销配置", async () => {
    findUnique.mockResolvedValue({
      credentials: {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        customerId: "123",
        availableAccounts: [
          { id: "123", name: "Main account", formatted: "123-456-7890" },
        ],
        remarketing: {
          tagId: "AW-123456789",
          source: "auto",
          confirmedAt: "2026-07-31T00:00:00.000Z",
          enabledEvents: ["view_item"],
          enabledFieldGroups: ["product"],
        },
      },
      updatedAt: new Date("2026-07-31T00:00:00.000Z"),
    });

    await setGoogleAdsCredential("shop.myshopify.com", {
      accessToken: "new-token",
      refreshToken: "refresh-token",
      customerId: "123",
      loginCustomerId: "123",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          credentials: expect.objectContaining({
            accessToken: "new-token",
            availableAccounts: [
              { id: "123", name: "Main account", formatted: "123-456-7890" },
            ],
            remarketing: expect.objectContaining({ tagId: "AW-123456789" }),
          }),
          externalAccountId: "123",
        }),
      }),
    );
  });
});
