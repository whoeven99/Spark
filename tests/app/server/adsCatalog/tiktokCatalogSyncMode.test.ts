import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appendLog = vi.hoisted(() => vi.fn());
const completeTask = vi.hoisted(() => vi.fn());
const failTask = vi.hoisted(() => vi.fn());
const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const setTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const upsertTiktokCatalogItems = vi.hoisted(() => vi.fn());
const confirmTiktokCatalogUpload = vi.hoisted(() => vi.fn());
const fetchTiktokCatalogConf = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/db.server", () => ({ default: {} }));

vi.mock("../../../../app/server/aiTask/aiTaskLogger.server", () => ({
  appendLog: (...args: unknown[]) => appendLog(...args),
  completeTask: (...args: unknown[]) => completeTask(...args),
  failTask: (...args: unknown[]) => failTask(...args),
}));

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
  setTiktokCatalogCredential: (...args: unknown[]) => setTiktokCatalogCredential(...args),
  getFacebookCatalogCredential: vi.fn(),
  getGoogleMerchantCredential: vi.fn(),
  setGoogleMerchantCredential: vi.fn(),
}));

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server")
    >();
  return {
    ...actual,
    upsertTiktokCatalogItems: (...args: unknown[]) => upsertTiktokCatalogItems(...args),
    createTiktokCatalog: vi.fn(),
    resolveTiktokCatalogRegion: vi.fn(),
    fetchTiktokCatalogConf: (...args: unknown[]) => fetchTiktokCatalogConf(...args),
  };
});

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogUploadConfirm.server", () => ({
  confirmTiktokCatalogUpload: (...args: unknown[]) => confirmTiktokCatalogUpload(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/facebookGraphClient.server", () => ({
  upsertFacebookCatalogItems: vi.fn(),
}));

vi.mock("../../../../app/server/adsCatalog/clients/googleMerchantClient.server", () => ({
  refreshGoogleAccessToken: vi.fn(),
  upsertGoogleMerchantProducts: vi.fn(),
}));

vi.mock("../../../../app/server/adsCatalog/gmcStatusChecker.server", () => ({
  checkGmcProductStatuses: vi.fn(),
  scheduleGmcStatusCheck: vi.fn(),
}));

vi.mock("../../../../app/server/adsCatalog/metaCatalogStatusChecker.server", () => ({
  checkMetaCatalogStatuses: vi.fn(),
  scheduleMetaCatalogStatusCheck: vi.fn(),
}));

vi.mock("../../../../app/i18n", () => ({
  initI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

import { enqueueAdsCatalogSync } from "../../../../app/server/adsCatalog/adsCatalogAsync.server";
import type { RawShopifyProductForCatalog } from "../../../../app/server/adsCatalog/productFetcher.server";

const sampleProduct: RawShopifyProductForCatalog = {
  id: "gid://shopify/Product/1",
  title: "Demo Product",
  handle: "demo-product",
  descriptionHtml: "<p>Hello</p>",
  vendor: "Brand",
  productType: "Type",
  tags: [],
  status: "ACTIVE",
  onlineStoreUrl: "https://example.com/products/demo-product",
  featuredImage: { url: "https://cdn.example.com/a.jpg", altText: null },
  images: [{ url: "https://cdn.example.com/a.jpg", altText: null }],
  priceAmount: "19.99",
  priceCurrency: "USD",
  variantId: "gid://shopify/ProductVariant/1",
  sku: "SKU-1",
  barcode: null,
  inventoryQuantity: 5,
  availableForSale: true,
  variantCount: 1,
  variants: [],
  gender: null,
  ageGroup: null,
};

describe("runTiktokSync binding modes", () => {
  beforeEach(() => {
    appendLog.mockReset();
    completeTask.mockReset();
    failTask.mockReset();
    getTiktokCatalogCredential.mockReset();
    setTiktokCatalogCredential.mockReset();
    upsertTiktokCatalogItems.mockReset();
    confirmTiktokCatalogUpload.mockReset();
    completeTask.mockResolvedValue(undefined);
    failTask.mockResolvedValue(undefined);
    appendLog.mockResolvedValue(undefined);
    setTiktokCatalogCredential.mockResolvedValue(undefined);
    confirmTiktokCatalogUpload.mockResolvedValue({
      succeeded: 1,
      errors: [],
      verifiedVia: "product_log",
      feedLogId: "feed-1",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-api",
      channel: "CLIENT",
      currency: "USD",
      isShopifyOfficial: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function runSync() {
    enqueueAdsCatalogSync({
      taskId: "task-1",
      shop: "demo.myshopify.com",
      shopDomain: "example.com",
      defaultCurrency: "USD",
      brand: "Brand",
      locale: "en",
      platform: "tiktok",
      products: [sampleProduct],
    });
    await vi.waitFor(() => {
      expect(completeTask.mock.calls.length + failTask.mock.calls.length).toBeGreaterThan(0);
    });
  }

  it("Path A shopify_official skips product/upload", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      bindingMode: "shopify_official",
      updatedAt: new Date().toISOString(),
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat",
      isShopifyOfficial: true,
    });

    await runSync();

    expect(upsertTiktokCatalogItems).not.toHaveBeenCalled();
    expect(completeTask).toHaveBeenCalledOnce();
    const payload = completeTask.mock.calls[0]?.[0] as {
      result: { syncMode?: string; succeeded?: number };
    };
    expect(payload.result.syncMode).toBe("shopify_official");
    expect(payload.result.succeeded).toBe(1);
  });

  it("Path B upgrades to official when upload returns Shopify lock error", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      catalogName: "Locked",
      bindingMode: "api_managed",
      updatedAt: new Date().toISOString(),
    });
    upsertTiktokCatalogItems.mockResolvedValue({
      totalRequested: 1,
      totalProcessed: 0,
      errors: [
        {
          id: "SKU-1",
          reason:
            "TikTok Catalog upload failed: HTTP 200 code=40002 Your catalog is synced from Shopify and cannot be modified via API.",
        },
      ],
    });

    await runSync();

    expect(upsertTiktokCatalogItems).toHaveBeenCalledOnce();
    expect(confirmTiktokCatalogUpload).not.toHaveBeenCalled();
    expect(setTiktokCatalogCredential).toHaveBeenCalledWith(
      "demo.myshopify.com",
      expect.objectContaining({ bindingMode: "shopify_official" }),
    );
    expect(completeTask).toHaveBeenCalledOnce();
    const payload = completeTask.mock.calls[0]?.[0] as {
      result: { syncMode?: string; succeeded?: number; failed?: number };
    };
    expect(payload.result.syncMode).toBe("shopify_official");
    expect(payload.result.succeeded).toBe(1);
    expect(payload.result.failed).toBe(0);
  });

  it("Path B confirms ingest via product/log before marking success", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-api",
      catalogName: "Spark Catalog",
      bindingMode: "api_managed",
      updatedAt: new Date().toISOString(),
    });
    upsertTiktokCatalogItems.mockResolvedValue({
      totalRequested: 1,
      totalProcessed: 1,
      errors: [],
      feedLogId: "feed-22",
    });
    confirmTiktokCatalogUpload.mockResolvedValue({
      succeeded: 0,
      errors: [{ id: "SKU-1", reason: "currency mismatch" }],
      verifiedVia: "product_log",
      feedLogId: "feed-22",
    });

    await runSync();

    expect(confirmTiktokCatalogUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: "cat-api",
        feedLogId: "feed-22",
        expectedSkuIds: ["SKU-1"],
      }),
    );
    expect(failTask).toHaveBeenCalledOnce();
    const payload = failTask.mock.calls[0]?.[0] as {
      result: {
        syncMode?: string;
        succeeded?: number;
        failed?: number;
        feedLogId?: string;
        catalogId?: string;
      };
      errorMsg?: string;
    };
    expect(payload.result.syncMode).toBe("api_managed");
    expect(payload.result.succeeded).toBe(0);
    expect(payload.result.failed).toBe(1);
    expect(payload.result.feedLogId).toBe("feed-22");
    expect(payload.result.catalogId).toBe("cat-api");
    expect(payload.errorMsg).toContain("currency mismatch");
  });
});
