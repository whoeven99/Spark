import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureGoogleMerchantDataSource,
  listGoogleMerchantAccounts,
  normalizeMerchantProductId,
  toGoogleMerchantProductInput,
  upsertGoogleMerchantProducts,
} from "../../../../app/server/adsCatalog/clients/googleMerchantClient.server";
import type { GoogleMerchantProduct } from "../../../../app/server/adsCatalog/mappers/shopifyToGoogle";

const product: GoogleMerchantProduct = {
  offerId: "SKU/123",
  title: "Test product",
  description: "Description",
  link: "https://example.com/products/test",
  imageLink: "https://example.com/test.jpg",
  contentLanguage: "en",
  targetCountry: "US",
  channel: "online",
  availability: "in stock",
  condition: "new",
  price: { value: "15.99", currency: "usd" },
  salePrice: { value: "12.50", currency: "usd" },
  brand: "Spark",
  gtin: "1234567890123",
  mpn: "SKU/123",
  identifierExists: true,
  sizes: ["M"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Merchant API v1 product input", () => {
  it("moves identifiers to the top level and converts attributes", () => {
    expect(toGoogleMerchantProductInput(product, "us")).toEqual({
      offerId: "SKU/123",
      contentLanguage: "en",
      feedLabel: "US",
      productAttributes: {
        title: "Test product",
        description: "Description",
        link: "https://example.com/products/test",
        imageLink: "https://example.com/test.jpg",
        availability: "IN_STOCK",
        condition: "NEW",
        price: { amountMicros: "15990000", currencyCode: "USD" },
        salePrice: { amountMicros: "12500000", currencyCode: "USD" },
        brand: "Spark",
        gtins: ["1234567890123"],
        mpn: "SKU/123",
        identifierExists: true,
        sizes: ["M"],
      },
    });
  });

  it("normalizes notification product identifiers for v1 get", () => {
    expect(normalizeMerchantProductId("online~en~US~SKU/123")).toBe("en~US~SKU/123");
    expect(normalizeMerchantProductId("en~US~SKU/123")).toBe("en~US~SKU/123");
  });
});

describe("Merchant API v1 accounts and data sources", () => {
  it("lists authorized accounts through accounts.list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        accounts: [{ name: "accounts/123", accountId: "123", accountName: "Demo" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listGoogleMerchantAccounts("token")).resolves.toEqual([
      { name: "accounts/123", accountId: "123", accountName: "Demo" },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "merchantapi.googleapis.com/accounts/v1/accounts",
    );
  });

  it("reuses a matching API primary data source", async () => {
    const source = {
      name: "accounts/123/dataSources/456",
      input: "API",
      primaryProductDataSource: {
        channel: "ONLINE",
        contentLanguage: "en",
        feedLabel: "US",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dataSources: [source] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureGoogleMerchantDataSource({
        accessToken: "token",
        merchantId: "123",
        contentLanguage: "en",
        feedLabel: "US",
      }),
    ).resolves.toEqual(source);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a matching primary source when list omits output-only input", async () => {
    const source = {
      name: "accounts/123/dataSources/456",
      primaryProductDataSource: {
        channel: "ONLINE",
        contentLanguage: "en",
        feedLabel: "US",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dataSources: [source] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureGoogleMerchantDataSource({
        accessToken: "token",
        merchantId: "123",
        contentLanguage: "en",
        feedLabel: "US",
        preferredName: source.name,
      }),
    ).resolves.toEqual(source);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a primary API data source when none matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ dataSources: [] }))
      .mockResolvedValueOnce(
        Response.json({ name: "accounts/123/dataSources/789", input: "API" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await ensureGoogleMerchantDataSource({
      accessToken: "token",
      merchantId: "123",
      contentLanguage: "en",
      feedLabel: "US",
    });
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      primaryProductDataSource: {
        channel: "ONLINE",
        contentLanguage: "en",
        feedLabel: "US",
      },
    });
  });
});

describe("Merchant API v1 product insertion", () => {
  it("returns per-product failures without failing the whole batch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: "ok" }))
      .mockResolvedValueOnce(
        Response.json({ error: { message: "invalid product" } }, { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await upsertGoogleMerchantProducts({
      accessToken: "token",
      merchantId: "123",
      dataSourceName: "accounts/123/dataSources/456",
      feedLabel: "US",
      products: [product, { ...product, offerId: "bad" }],
    });

    expect(result).toEqual({
      totalRequested: 2,
      totalProcessed: 1,
      errors: [{ id: "bad", reason: "invalid product" }],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "products/v1/accounts/123/productInputs:insert?dataSource=",
    );
  });
});
