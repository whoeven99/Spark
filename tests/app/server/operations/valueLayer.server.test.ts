import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import { computeChannelRoi } from "../../../../app/server/operations/channelRoi.server";
import { loadValueLayer } from "../../../../app/server/operations/valueLayer.server";
import { loadCustomerValueMap } from "../../../../app/server/operations/customerValue.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    shopOrder: {
      findMany: vi.fn(),
    },
    shopRefund: {
      findMany: vi.fn(),
    },
    shopCustomerValue: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../../app/server/operations/roi/costConfig.server", () => ({
  getShopCostConfig: vi.fn().mockResolvedValue({
    defaultGrossMarginPercent: 60,
    paymentFeePercent: 2.9,
    paymentFeeFixed: 0.3,
    monthlyFixedCost: 0,
    isConfigured: true,
  }),
}));

vi.mock("../../../../app/server/operations/roi/skuCostSync.server", () => ({
  ensureSkuCostsFresh: vi.fn().mockResolvedValue(undefined),
  loadSkuCostMap: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../../../../app/server/operations/customerValue.server", () => ({
  ensureCustomerValueLayer: vi.fn().mockResolvedValue({
    totalCustomers: 10,
    payingCustomers: 10,
    segmentCounts: { new: 1, active: 4, vip: 3, at_risk: 2, churned: 0 },
    tagCounts: { refund_risk: 1, discount_sensitive: 2 },
    averageScore: 76,
    medianScore: 78,
    repeatPurchaseRate: 40,
    highValueShare: 30,
    averageDynamicLtv: 180,
    updatedAt: "2026-08-22T00:00:00.000Z",
  }),
  getCustomerValueAggregates: vi.fn().mockResolvedValue({
    totalCustomers: 10,
    payingCustomers: 10,
    segmentCounts: { new: 1, active: 4, vip: 3, at_risk: 2, churned: 0 },
    tagCounts: { refund_risk: 1, discount_sensitive: 2 },
    averageScore: 76,
    medianScore: 78,
    repeatPurchaseRate: 40,
    highValueShare: 30,
    averageDynamicLtv: 180,
    updatedAt: "2026-08-22T00:00:00.000Z",
  }),
  loadCustomerValueMap: vi.fn().mockResolvedValue(
    new Map([
      ["c_1", { score: 88, segment: "vip", tags: ["refund_risk"] }],
      ["c_2", { score: 64, segment: "active", tags: [] }],
    ]),
  ),
}));

describe("computeChannelRoi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shopOrder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopRefund.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopCustomerValue.findMany).mockResolvedValue([] as never);
  });

  it("adds country filter to order query when scope is provided", async () => {
    await computeChannelRoi(
      "spark-test.myshopify.com",
      {
        defaultGrossMarginPercent: 60,
        paymentFeePercent: 2.9,
        paymentFeeFixed: 0.3,
        monthlyFixedCost: 0,
        isConfigured: true,
      },
      new Date("2026-08-22T00:00:00.000Z"),
      { countryCode: "de" },
    );

    expect(vi.mocked(prisma.shopOrder.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: {
        shop: "spark-test.myshopify.com",
        OR: [{ shippingCountryCode: "DE" }, { billingCountryCode: "DE" }],
      },
    });
  });
});

describe("loadValueLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shopRefund.findMany).mockResolvedValue([] as never);
  });

  it("returns country-scoped customer aggregates when country filter is provided", async () => {
    vi.mocked(prisma.shopOrder.findMany)
      .mockResolvedValueOnce([
        { shopifyCustomerId: "c_1" },
        { shopifyCustomerId: "c_2" },
        { shopifyCustomerId: "c_1" },
      ] as never)
      .mockResolvedValueOnce([
        {
          shopifyOrderId: "gid://shopify/Order/1",
          totalPrice: 120,
          totalDiscounts: 10,
          currency: "EUR",
          utmSource: "google",
          sourceName: "web",
          referringSite: null,
          isFirstOrder: true,
          shopifyCustomerId: "c_1",
          lineItems: [],
        },
      ] as never);
    vi.mocked(prisma.shopCustomerValue.findMany).mockResolvedValue([
      { dynamicLtv: 220 },
      { dynamicLtv: 140 },
    ] as never);

    const value = await loadValueLayer(
      { graphql: vi.fn() },
      "spark-test.myshopify.com",
      { countryCode: "DE" },
    );

    expect(loadCustomerValueMap).toHaveBeenCalledWith("spark-test.myshopify.com");
    expect(value.customers.totalCustomers).toBe(2);
    expect(value.customers.segmentCounts.vip).toBe(1);
    expect(value.customers.segmentCounts.active).toBe(1);
    expect(value.customers.tagCounts.refund_risk).toBe(1);
    expect(value.customers.averageDynamicLtv).toBe(180);
    expect(value.scope.countryCode).toBe("DE");
    expect(value.scope.notes[1]).toContain("全店客户价值模型");
  });
});
