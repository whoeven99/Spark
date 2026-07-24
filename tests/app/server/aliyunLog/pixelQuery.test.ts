import { describe, expect, it } from "vitest";
import {
  PIXEL_FUNNEL_EVENTS,
  buildFunnelMetrics,
  buildFunnelQuery,
  parseFunnelRows,
  type PixelFunnelCounts,
} from "../../../../app/server/aliyunLog/pixelQuery.server";

describe("parseFunnelRows", () => {
  it("maps grouped analytics rows to funnel counts", () => {
    const rows = [
      { event: PIXEL_FUNNEL_EVENTS.pageViewed, cnt: "1200", uv: "800" },
      { event: PIXEL_FUNNEL_EVENTS.addedToCart, cnt: "300", uv: "210" },
      { event: PIXEL_FUNNEL_EVENTS.checkoutStarted, cnt: "150", uv: "140" },
      { event: PIXEL_FUNNEL_EVENTS.paymentSubmitted, cnt: "120", uv: "115" },
      { event: PIXEL_FUNNEL_EVENTS.checkoutCompleted, cnt: "90", uv: "88" },
    ];
    expect(parseFunnelRows(rows)).toEqual({
      sessions: 800,
      pageViews: 1200,
      addToCartVisitors: 210,
      checkoutStarted: 150,
      paymentSubmitted: 120,
      checkoutCompleted: 90,
    });
  });

  it("treats missing events as zero and ignores unrelated topics", () => {
    const rows = [
      { event: PIXEL_FUNNEL_EVENTS.pageViewed, cnt: "10", uv: "7" },
      { event: "spark:shopify:search_submitted", cnt: "99", uv: "50" },
      { event: "spark:custom:image_replaced", cnt: "5", uv: "5" },
    ];
    const counts = parseFunnelRows(rows);
    expect(counts.sessions).toBe(7);
    expect(counts.pageViews).toBe(10);
    expect(counts.checkoutCompleted).toBe(0);
    expect(counts.addToCartVisitors).toBe(0);
  });

  it("ignores malformed numeric values", () => {
    const rows = [
      { event: PIXEL_FUNNEL_EVENTS.pageViewed, cnt: "abc", uv: "-3" },
    ];
    const counts = parseFunnelRows(rows);
    expect(counts.pageViews).toBe(0);
    expect(counts.sessions).toBe(0);
  });
});

describe("buildFunnelMetrics", () => {
  const base: PixelFunnelCounts = {
    sessions: 1000,
    pageViews: 2000,
    addToCartVisitors: 250,
    checkoutStarted: 200,
    paymentSubmitted: 160,
    checkoutCompleted: 120,
  };

  it("computes funnel ratios rounded to one decimal", () => {
    expect(buildFunnelMetrics(base)).toEqual({
      conversionRate: 12, // 120/1000
      addToCartRate: 25, // 250/1000
      checkoutRate: 60, // 120/200
      paymentRate: 75, // 120/160
    });
  });

  it("returns null for ratios whose denominator is zero", () => {
    const counts: PixelFunnelCounts = {
      sessions: 0,
      pageViews: 0,
      addToCartVisitors: 0,
      checkoutStarted: 0,
      paymentSubmitted: 0,
      checkoutCompleted: 0,
    };
    expect(buildFunnelMetrics(counts)).toEqual({
      conversionRate: null,
      addToCartRate: null,
      checkoutRate: null,
      paymentRate: null,
    });
  });
});

describe("buildFunnelQuery", () => {
  it("filters by lowercased shop and groups by event", () => {
    const q = buildFunnelQuery("MyShop.myshopify.com");
    expect(q).toContain('shopName: "myshop.myshopify.com"');
    expect(q).toContain("GROUP BY event");
    expect(q).toContain("approx_distinct(clientId) AS uv");
  });

  it("escapes embedded quotes in the shop value", () => {
    const q = buildFunnelQuery('evil".myshopify.com');
    expect(q).toContain('shopName: "evil\\".myshopify.com"');
  });
});
