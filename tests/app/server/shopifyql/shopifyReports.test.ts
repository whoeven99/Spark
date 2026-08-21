import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  chartAxisTicks,
  computeLinearChartDomain,
  emptyReportsPage,
  hasReadReportsScope,
  interpolateSince,
  niceChartMagnitude,
  normalizeReportRows,
  parseRangeKey,
  parseReportTab,
} from "../../../../app/lib/shopifyReports";
import { buildPresetQuery, listReportPresets } from "../../../../app/server/shopifyql/reportPresets.server";
import {
  loadShopifyReports,
  type ShopifyReportsRuntime,
} from "../../../../app/server/shopifyql/shopifyReports.server";
import {
  executeShopifyqlQuery,
  isShopifyqlAccessDenied,
  retryAfterMsFromCost,
} from "../../../../app/server/shopifyql/shopifyqlQuery.server";
import { sparkKvKey } from "../../../../app/server/kv/sparkKv.server";

function memoryRuntime(overrides: Partial<ShopifyReportsRuntime> = {}): ShopifyReportsRuntime {
  return {
    readCache: async () => null,
    loadSnapshot: async () => null,
    writeCache: async () => undefined,
    persistPage: async () => undefined,
    acquireLock: async () => true,
    releaseLock: async () => undefined,
    enqueueRefresh: vi.fn(),
    ...overrides,
  };
}

describe("shopify reports helpers", () => {
  it("parses tab and range from query params", () => {
    expect(parseReportTab("inventory")).toBe("inventory");
    expect(parseReportTab("profit")).toBe("profit");
    expect(parseReportTab("unknown")).toBe("sales");
    expect(parseRangeKey("90d")).toBe("90d");
    expect(parseRangeKey("week")).toBe("30d");
  });

  it("detects read_reports in a session scope string", () => {
    expect(hasReadReportsScope("read_orders,read_reports")).toBe(true);
    expect(hasReadReportsScope("read_orders, read_inventory")).toBe(false);
    expect(hasReadReportsScope(null)).toBe(false);
  });

  it("interpolates SINCE placeholders", () => {
    expect(interpolateSince("SINCE {{SINCE}} UNTIL today", "7d")).toBe("SINCE -7d UNTIL today");
    expect(buildPresetQuery(listReportPresets("sales")[0]!, "30d")).toContain("SINCE -30d");
  });

  it("uses 2026-07 sales reversal fields and queries both sales and returns datasets", () => {
    const salesSummary = listReportPresets("sales")[0]!;
    const refunds = listReportPresets("refunds");
    const refundsSummary = refunds.find((preset) => preset.id === "refunds-summary");

    expect(salesSummary.query).toContain("sales_reversals");
    expect(salesSummary.query).not.toContain(", returns");
    expect(refundsSummary?.query).toContain("sales_reversals");
    expect(refundsSummary?.query).toContain("reversed_quantity");
    expect(refundsSummary?.query).not.toContain("net_returns");
    expect(refunds.filter((preset) => preset.kind === "timeseries").map((preset) => preset.id)).toEqual([
      "refunds-reversals-quantity-trend",
      "refunds-reversals-amount-trend",
      "refunds-trend",
    ]);
    expect(refunds.some((preset) => preset.id === "refunds-reversal-product")).toBe(true);
    expect(refunds.some((preset) => preset.id === "refunds-reversal-order")).toBe(true);
    expect(refunds.some((preset) => preset.id === "refunds-return-reason")).toBe(true);
    expect(refunds.some((preset) => preset.query.includes("FROM returns"))).toBe(true);
    expect(refunds.find((preset) => preset.id === "refunds-reversal-order")?.query).toContain("order_name");
    expect(refunds.find((preset) => preset.id === "refunds-return-reason")?.query).toContain("return_reason");
  });

  it("adds a profit tab with official COGS, gross profit, and customer-paid shipping", () => {
    const profit = listReportPresets("profit");
    const summary = profit.find((preset) => preset.id === "profit-summary");
    const trend = profit.find((preset) => preset.id === "profit-trend");
    const shipping = profit.find((preset) => preset.id === "profit-shipping-trend");
    const product = profit.find((preset) => preset.id === "profit-product");
    const labelSummary = profit.find((preset) => preset.id === "profit-shipping-labels-summary");
    const labelTrend = profit.find((preset) => preset.id === "profit-shipping-labels-trend");
    const labelCarrier = profit.find((preset) => preset.id === "profit-shipping-labels-carrier");

    expect(profit.map((preset) => preset.id)).toEqual([
      "profit-summary",
      "profit-trend",
      "profit-shipping-trend",
      "profit-shipping-labels-summary",
      "profit-product",
      "profit-shipping-labels-trend",
      "profit-shipping-labels-carrier",
    ]);
    expect(summary?.query).toContain("cost_of_goods_sold");
    expect(summary?.query).toContain("gross_profit");
    expect(summary?.query).toContain("shipping_charges");
    expect(summary?.query).not.toContain("shop_campaign_ad_spend");
    expect(trend?.seriesKeys).toEqual(["gross_profit", "cost_of_goods_sold"]);
    expect(shipping?.query).toContain("total_shipping_charges");
    expect(product?.query).toContain("GROUP BY product_title");
    expect(labelSummary?.query).toContain("FROM shipping_labels");
    expect(labelSummary?.query).toContain("shipping_label_costs");
    expect(labelTrend?.seriesKeys).toEqual(["shipping_label_costs"]);
    expect(labelCarrier?.query).toContain("GROUP BY shipping_carrier");
  });

  it("keeps negative reversal quantities visible on the chart domain", () => {
    expect(niceChartMagnitude(58)).toBe(100);
    expect(computeLinearChartDomain([-58, 0, 0])).toEqual({ min: -100, max: 0 });
    expect(computeLinearChartDomain([0, 0])).toEqual({ min: 0, max: 1 });
    expect(chartAxisTicks(-100, 0)).toEqual([-100, -50, 0]);
  });

  it("normalizes object rows only", () => {
    expect(
      normalizeReportRows([
        { day: "2026-08-01", total_sales: "12.5" },
        ["skip"],
        null,
      ]),
    ).toEqual([{ day: "2026-08-01", total_sales: "12.5" }]);
  });

  it("detects access denied errors", () => {
    expect(
      isShopifyqlAccessDenied([
        {
          message: "Access denied for shopifyqlQuery field.",
          extensions: { code: "ACCESS_DENIED" },
        },
      ]),
    ).toBe(true);
    expect(isShopifyqlAccessDenied([{ message: "timeout" }])).toBe(false);
  });

  it("namespaces Spark KV keys under spark:", () => {
    expect(sparkKvKey("shopify-reports", "lock", "a.myshopify.com")).toBe(
      "spark:shopify-reports:lock:a.myshopify.com",
    );
  });

  it("computes ShopifyQL retry delay from windowResetAt", () => {
    expect(
      retryAfterMsFromCost(
        { windowResetAt: "2026-08-21T04:00:10.000Z" },
        Date.parse("2026-08-21T04:00:00.000Z"),
      ),
    ).toBe(10_000);
  });
});

describe("executeShopifyqlQuery", () => {
  it("maps table rows and columns", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              shopifyqlQuery: {
                parseErrors: [],
                tableData: {
                  columns: [
                    { name: "day", dataType: "DAY_TIMESTAMP", displayName: "Day" },
                    { name: "total_sales", dataType: "MONEY", displayName: "Total sales" },
                  ],
                  rows: [{ day: "2026-08-01", total_sales: "88.2" }],
                },
              },
            },
          }),
        ),
      ),
    };

    const result = await executeShopifyqlQuery(admin, "FROM sales SHOW total_sales");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.columns[1]?.name).toBe("total_sales");
    expect(result.rows[0]?.total_sales).toBe("88.2");
  });

  it("returns accessDenied when GraphQL rejects the field", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                message: "Access denied for shopifyqlQuery field. Required access: `read_reports` access scope.",
                extensions: { code: "ACCESS_DENIED" },
              },
            ],
          }),
        ),
      ),
    };

    const result = await executeShopifyqlQuery(admin, "FROM sales SHOW total_sales");
    expect(result.ok).toBe(false);
    expect(result.accessDenied).toBe(true);
  });

  it("marks throttled ShopifyQL responses for retry", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "Rate limited. Please retry later.", extensions: { code: "THROTTLED" } }],
            extensions: {
              shopifyqlCost: { currentlyAvailable: 0, windowResetAt: "2026-08-21T04:00:05.000Z" },
            },
          }),
          { status: 429 },
        ),
      ),
    };

    const result = await executeShopifyqlQuery(admin, "FROM sales SHOW total_sales");
    expect(result.ok).toBe(false);
    expect(result.throttled).toBe(true);
  });
});

describe("loadShopifyReports", () => {
  const shop = "demo.myshopify.com";

  it("does not call ShopifyQL when the scope is missing", async () => {
    const graphql = vi.fn();
    const admin: ShopifyAdminGraphqlClient = { graphql };
    const fetchPage = vi.fn();

    const page = await loadShopifyReports({
      admin,
      shop,
      tab: "sales",
      range: "7d",
      hasReadReports: false,
      runtime: memoryRuntime({ fetchPage }),
    });

    expect(page.access).toBe("missing_scope");
    expect(page.queries).toEqual([]);
    expect(graphql).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("returns a fresh Redis page without hitting Shopify or Turso", async () => {
    const fetchPage = vi.fn();
    const loadSnapshot = vi.fn();
    const cached = emptyReportsPage("sales", "7d", "ok", {
      freshness: "fresh",
      fetchedAt: "2026-08-21T04:00:00.000Z",
      queries: [
        {
          id: "sales-summary",
          kind: "summary",
          query: "FROM sales SHOW total_sales",
          titleKey: "shopifyReports.summaryTitle",
          seriesKeys: [],
          xKey: "day",
          columns: [],
          rows: [{ total_sales: 10 }],
          parseErrors: [],
          error: null,
        },
      ],
    });

    const page = await loadShopifyReports({
      admin: { graphql: vi.fn() },
      shop,
      tab: "sales",
      range: "7d",
      hasReadReports: true,
      runtime: memoryRuntime({
        readCache: async () => cached,
        loadSnapshot,
        fetchPage,
      }),
    });

    expect(page.queries[0]?.rows[0]?.total_sales).toBe(10);
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("returns a stale Turso snapshot and enqueues a refresh", async () => {
    const enqueueRefresh = vi.fn();
    const fetchPage = vi.fn();
    const snapshot = emptyReportsPage("sales", "30d", "ok", {
      freshness: "stale",
      fetchedAt: "2026-08-21T03:00:00.000Z",
      queries: [
        {
          id: "sales-summary",
          kind: "summary",
          query: "FROM sales SHOW total_sales",
          titleKey: "shopifyReports.summaryTitle",
          seriesKeys: [],
          xKey: "day",
          columns: [],
          rows: [{ total_sales: 42 }],
          parseErrors: [],
          error: null,
        },
      ],
    });

    const page = await loadShopifyReports({
      admin: { graphql: vi.fn() },
      shop,
      tab: "sales",
      range: "30d",
      hasReadReports: true,
      runtime: memoryRuntime({
        loadSnapshot: async () => snapshot,
        enqueueRefresh,
        fetchPage,
      }),
    });

    expect(page.refreshing).toBe(true);
    expect(page.queries[0]?.rows[0]?.total_sales).toBe(42);
    expect(enqueueRefresh).toHaveBeenCalledTimes(1);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fetches Shopify only on a cold start after acquiring the shop lock", async () => {
    const persistPage = vi.fn();
    const releaseLock = vi.fn();
    const fetched = emptyReportsPage("sales", "7d", "ok", {
      freshness: "fresh",
      fetchedAt: "2026-08-21T04:10:00.000Z",
    });

    const page = await loadShopifyReports({
      admin: { graphql: vi.fn() },
      shop,
      tab: "sales",
      range: "7d",
      hasReadReports: true,
      runtime: memoryRuntime({
        persistPage,
        releaseLock,
        fetchPage: async () => fetched,
      }),
    });

    expect(page.fetchedAt).toBe("2026-08-21T04:10:00.000Z");
    expect(persistPage).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("returns loading when another refresh already holds the shop lock", async () => {
    const fetchPage = vi.fn();
    const page = await loadShopifyReports({
      admin: { graphql: vi.fn() },
      shop,
      tab: "sales",
      range: "7d",
      hasReadReports: true,
      runtime: memoryRuntime({
        acquireLock: async () => false,
        fetchPage,
      }),
    });

    expect(page.freshness).toBe("loading");
    expect(page.refreshing).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("collapses ACCESS_DENIED into a page-level empty state", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async (query: string) => {
        if (String(query).includes("ShopBasicInfo")) {
          return new Response(JSON.stringify({ data: { shop: { currencyCode: "USD", ianaTimezone: "UTC" } } }));
        }
        return new Response(
          JSON.stringify({
            errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }],
          }),
        );
      }),
    };

    const page = await loadShopifyReports({
      admin,
      shop,
      tab: "sales",
      range: "7d",
      hasReadReports: true,
      runtime: memoryRuntime(),
    });

    expect(page.access).toBe("access_denied");
    expect(page.queries).toEqual([]);
  });
});
