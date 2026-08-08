import { describe, expect, it } from "vitest";
import {
  buildActivityFunnel,
  buildGooglePixelBaseQuery,
  buildGooglePixelCountQuery,
  parseActivityCountRows,
  parseActivityDailyRows,
} from "../../../../app/server/aliyunLog/googlePixelActivity.server";

describe("buildGooglePixelBaseQuery", () => {
  it("scopes shop and google topic tokens without illegal colon in value", () => {
    expect(buildGooglePixelBaseQuery("MyShop.myshopify.com")).toBe(
      'shopName: "myshop.myshopify.com" and event: spark and event: google',
    );
  });
});

describe("buildGooglePixelCountQuery", () => {
  it("wraps aggregation SQL", () => {
    const query = buildGooglePixelCountQuery("demo.myshopify.com");
    expect(query).toContain('shopName: "demo.myshopify.com"');
    expect(query).toContain("SELECT event, COUNT(*) AS cnt GROUP BY event");
  });
});

describe("parseActivityCountRows", () => {
  it("maps spark:google topics to activity cards", () => {
    const counts = parseActivityCountRows([
      { event: "spark:google:page_view", cnt: "32" },
      { event: "spark:google:add_to_cart", cnt: "5" },
      { event: "spark:shopify:page_viewed", cnt: "999" },
      { event: "spark:google:purchase", cnt: "1" },
    ]);
    expect(counts).toEqual({
      page_view: 32,
      add_to_cart: 5,
      begin_checkout: 0,
      add_payment_info: 0,
      purchase: 1,
    });
  });
});

describe("parseActivityDailyRows", () => {
  it("groups trend events by day and ignores page_view", () => {
    const daily = parseActivityDailyRows([
      { day: "2026-08-07", event: "spark:google:add_to_cart", cnt: "2" },
      { day: "2026-08-08", event: "spark:google:add_to_cart", cnt: "5" },
      { day: "2026-08-08", event: "spark:google:purchase", cnt: "1" },
      { day: "2026-08-08", event: "spark:google:page_view", cnt: "20" },
    ]);
    expect(daily).toEqual([
      { day: "2026-08-07", counts: { add_to_cart: 2 } },
      { day: "2026-08-08", counts: { add_to_cart: 5, purchase: 1 } },
    ]);
  });
});

describe("buildActivityFunnel", () => {
  it("computes step rates from previous stage", () => {
    const funnel = buildActivityFunnel({
      page_view: 32,
      add_to_cart: 5,
      begin_checkout: 1,
      add_payment_info: 1,
      purchase: 1,
    });
    expect(funnel).toEqual([
      { event: "add_to_cart", count: 5, rateFromPrev: null },
      { event: "begin_checkout", count: 1, rateFromPrev: 20 },
      { event: "add_payment_info", count: 1, rateFromPrev: 100 },
      { event: "purchase", count: 1, rateFromPrev: 100 },
    ]);
  });
});
