import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  chartAxisTicks,
  computeLinearChartDomain,
  hasReadReportsScope,
  interpolateSince,
  niceChartMagnitude,
  normalizeReportRows,
  parseRangeKey,
  parseReportTab,
} from "../../../../app/lib/shopifyReports";
import { buildPresetQuery, listReportPresets } from "../../../../app/server/shopifyql/reportPresets.server";
import { loadShopifyReports } from "../../../../app/server/shopifyql/shopifyReports.server";
import {
  executeShopifyqlQuery,
  isShopifyqlAccessDenied,
} from "../../../../app/server/shopifyql/shopifyqlQuery.server";

describe("shopify reports helpers", () => {
  it("parses tab and range from query params", () => {
    expect(parseReportTab("inventory")).toBe("inventory");
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
    expect(refunds.some((preset) => preset.query.includes("FROM returns"))).toBe(true);
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
});

describe("loadShopifyReports", () => {
  it("does not call ShopifyQL when the scope is missing", async () => {
    const graphql = vi.fn();
    const admin: ShopifyAdminGraphqlClient = { graphql };

    const page = await loadShopifyReports({
      admin,
      tab: "sales",
      range: "7d",
      hasReadReports: false,
    });

    expect(page.access).toBe("missing_scope");
    expect(page.queries).toEqual([]);
    expect(graphql).not.toHaveBeenCalled();
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
      tab: "sales",
      range: "7d",
      hasReadReports: true,
    });

    expect(page.access).toBe("access_denied");
    expect(page.queries).toEqual([]);
  });
});
