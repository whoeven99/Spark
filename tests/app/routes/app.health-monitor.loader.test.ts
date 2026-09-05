import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();
const ensureDailySnapshot = vi.fn();
const ensureDailySnapshotOverview = vi.fn();
const loadHealthMonitorSignals = vi.fn();
const fetchShopLocalesPayloadCached = vi.fn();
const fetchShopBasicInfo = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    admin: authenticateAdmin,
  },
}));

vi.mock("../../../app/server/operations/dailyInspection.server", () => ({
  ensureDailySnapshot,
  ensureDailySnapshotOverview,
}));

vi.mock("../../../app/server/operations/healthMonitorSignals.server", () => ({
  loadHealthMonitorSignals,
}));

vi.mock("../../../app/server/productImprove/shopLocalesFetcher.server", () => ({
  fetchShopLocalesPayloadCached,
}));

vi.mock("../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo,
}));

const { loader, shouldRevalidate } = await import("../../../app/routes/app.health-monitor");

const SHOP = "spark-test.myshopify.com";
const ADMIN = { graphql: vi.fn() };

const overviewSnapshot = {
  shop: SHOP,
  snapshotDate: "2026-08-26",
  generatedAt: "2026-08-26T12:00:00.000Z",
  hasData: true,
  metrics: {},
  overview: {
    salesGrowthRate: null,
    sessions7d: null,
    conversionRate7d: null,
  },
  environments: [],
  items: [],
  insights: [],
  tasks: [],
  review: null,
};

const detailSnapshot = {
  ...overviewSnapshot,
  detail: {
    overdueOrders: [],
    routineUnfulfilledOrders: [],
    carrierIssues: [],
    inventoryRisks: [],
    topRefundSkus: [],
    abnormalRefundOrders: [],
  },
};

describe("health-monitor loader snapshot entry", () => {
  beforeEach(() => {
    authenticateAdmin.mockReset();
    ensureDailySnapshot.mockReset();
    ensureDailySnapshotOverview.mockReset();
    loadHealthMonitorSignals.mockReset();
    fetchShopLocalesPayloadCached.mockReset();
    fetchShopBasicInfo.mockReset();

    authenticateAdmin.mockResolvedValue({
      admin: ADMIN,
      session: { shop: SHOP },
    });
    fetchShopBasicInfo.mockResolvedValue({
      myshopifyDomain: SHOP,
      ianaTimezone: "UTC",
    });
    fetchShopLocalesPayloadCached.mockResolvedValue({
      defaultTargetLanguage: "en",
    });
    loadHealthMonitorSignals.mockResolvedValue({
      ads: null,
      seo: null,
      pricing: null,
    });
    ensureDailySnapshotOverview.mockResolvedValue(overviewSnapshot);
    ensureDailySnapshot.mockResolvedValue(detailSnapshot);
  });

  it("uses the overview snapshot on the default total view", async () => {
    const result = await loader({
      request: new Request("https://example.com/app/health-monitor"),
    } as never);

    expect(ensureDailySnapshotOverview).toHaveBeenCalledWith(SHOP, { shopifyAdmin: ADMIN });
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
    expect(loadHealthMonitorSignals).toHaveBeenCalledWith({ shop: SHOP });
    expect(result.usingFallback).toBe(false);
  });

  it("uses the overview snapshot when view=overview", async () => {
    await loader({
      request: new Request("https://example.com/app/health-monitor?view=overview"),
    } as never);

    expect(ensureDailySnapshotOverview).toHaveBeenCalledTimes(1);
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });

  it("uses the full snapshot when opening the detail view", async () => {
    const result = await loader({
      request: new Request(
        "https://example.com/app/health-monitor?view=detail&monitor=refund-health",
      ),
    } as never);

    expect(ensureDailySnapshot).toHaveBeenCalledWith(SHOP, { shopifyAdmin: ADMIN });
    expect(ensureDailySnapshotOverview).not.toHaveBeenCalled();
    expect(result.usingFallback).toBe(false);
  });

  it("does not load signals when the snapshot fails and falls back to demo data", async () => {
    ensureDailySnapshotOverview.mockRejectedValue(new Error("snapshot unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await loader({
        request: new Request("https://example.com/app/health-monitor"),
      } as never);

      expect(result.usingFallback).toBe(true);
      expect(loadHealthMonitorSignals).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("revalidates through the route export when opening detail from overview", () => {
    expect(
      shouldRevalidate({
        currentUrl: new URL("https://example.com/app/health-monitor?view=overview"),
        nextUrl: new URL("https://example.com/app/health-monitor?view=detail&monitor=refund-health"),
        defaultShouldRevalidate: false,
      } as never),
    ).toBe(true);
  });
});
