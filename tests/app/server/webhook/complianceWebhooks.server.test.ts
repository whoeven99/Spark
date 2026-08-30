import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalizeComplianceTopic,
  handleComplianceWebhook,
  isComplianceTopic,
  summarizeCompliancePayload,
} from "../../../../app/server/webhook/complianceWebhooks.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    shopCustomerValue: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    shopCustomer: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    shopOrder: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock("../../../../app/server/shopDataLifecycle/archiveAndPurgeShop.server", () => ({
  archiveAndPurgeShopData: vi.fn().mockResolvedValue({
    archive: { ok: true },
    purge: { deleted: {}, errors: [] },
  }),
}));

describe("canonicalizeComplianceTopic", () => {
  it("maps slash headers and GraphQL enums to the same topic", () => {
    expect(canonicalizeComplianceTopic("CUSTOMERS_DATA_REQUEST")).toBe(
      "customers/data_request",
    );
    expect(canonicalizeComplianceTopic("customers/data_request")).toBe(
      "customers/data_request",
    );
    expect(canonicalizeComplianceTopic("CUSTOMERS_REDACT")).toBe(
      "customers/redact",
    );
    expect(canonicalizeComplianceTopic("SHOP_REDACT")).toBe("shop/redact");
    expect(canonicalizeComplianceTopic("app/uninstalled")).toBeNull();
  });
});

describe("isComplianceTopic", () => {
  it("accepts the three mandatory topics in either header form", () => {
    expect(isComplianceTopic("customers/data_request")).toBe(true);
    expect(isComplianceTopic("CUSTOMERS_DATA_REQUEST")).toBe(true);
    expect(isComplianceTopic("customers/redact")).toBe(true);
    expect(isComplianceTopic("shop/redact")).toBe(true);
    expect(isComplianceTopic("app/uninstalled")).toBe(false);
  });
});

describe("summarizeCompliancePayload", () => {
  it("extracts customers/data_request ids", () => {
    expect(
      summarizeCompliancePayload("customers/data_request", {
        shop_id: 954889,
        shop_domain: "example.myshopify.com",
        orders_requested: [299938, 280263],
        customer: { id: 191167, email: "john@example.com" },
        data_request: { id: 9999 },
      }),
    ).toEqual({
      topic: "customers/data_request",
      shopDomain: "example.myshopify.com",
      shopId: 954889,
      customerId: 191167,
      dataRequestId: 9999,
      orderIds: [299938, 280263],
    });
  });

  it("extracts customers/redact order ids", () => {
    expect(
      summarizeCompliancePayload("CUSTOMERS_REDACT", {
        shop_id: "1",
        customer: { id: "2" },
        orders_to_redact: [10, "11"],
      }),
    ).toMatchObject({
      topic: "customers/redact",
      shopId: 1,
      customerId: 2,
      orderIds: [10, 11],
    });
  });

  it("extracts shop/redact shop identity", () => {
    expect(
      summarizeCompliancePayload("shop/redact", {
        shop_id: 954889,
        shop_domain: "example.myshopify.com",
      }),
    ).toEqual({
      topic: "shop/redact",
      shopDomain: "example.myshopify.com",
      shopId: 954889,
      customerId: undefined,
      dataRequestId: undefined,
      orderIds: [],
    });
  });

  it("returns null for unrelated topics", () => {
    expect(summarizeCompliancePayload("app/uninstalled", {})).toBeNull();
  });
});

describe("handleComplianceWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs shop/redact archive+purge", async () => {
    const { archiveAndPurgeShopData } = await import(
      "../../../../app/server/shopDataLifecycle/archiveAndPurgeShop.server"
    );
    const result = await handleComplianceWebhook({
      shop: "example.myshopify.com",
      topic: "shop/redact",
      payload: { shop_id: 1, shop_domain: "example.myshopify.com" },
      webhookId: "wh-1",
    });
    expect(result.handled).toBe(true);
    expect(result.summary?.topic).toBe("shop/redact");
    expect(archiveAndPurgeShopData).toHaveBeenCalledWith({
      shop: "example.myshopify.com",
      mode: "shop_redact",
      reason: "shop/redact",
    });
  });

  it("rejects unrelated topics", async () => {
    const result = await handleComplianceWebhook({
      shop: "example.myshopify.com",
      topic: "app/uninstalled",
      payload: {},
    });
    expect(result).toEqual({ handled: false, summary: null });
  });
});
