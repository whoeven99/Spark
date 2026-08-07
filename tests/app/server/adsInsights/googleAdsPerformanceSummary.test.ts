import { describe, expect, it } from "vitest";
import {
  aggregatePerformanceDays,
  fillDailySeries,
  type GoogleAdsPerformanceDay,
} from "../../../../app/server/adsInsights/googleAdsPerformanceSummary.server";

function day(
  date: string,
  partial: Partial<Omit<GoogleAdsPerformanceDay, "date">> = {},
): GoogleAdsPerformanceDay {
  return {
    date,
    impressions: 0,
    clicks: 0,
    spend: 0,
    conversions: 0,
    conversionsValue: 0,
    purchases: 0,
    purchaseValue: 0,
    ...partial,
  };
}

describe("fillDailySeries", () => {
  it("fills missing UTC calendar days with zeros", () => {
    const sparse = new Map<string, GoogleAdsPerformanceDay>([
      ["2026-08-05", day("2026-08-05", { conversions: 2, spend: 10 })],
      ["2026-08-07", day("2026-08-07", { conversions: 1, clicks: 5 })],
    ]);
    const { days, dateStart, dateEnd } = fillDailySeries(
      7,
      sparse,
      new Date("2026-08-07T15:00:00.000Z"),
    );
    expect(dateStart).toBe("2026-08-01");
    expect(dateEnd).toBe("2026-08-07");
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(day("2026-08-01"));
    expect(days[4].conversions).toBe(2);
    expect(days[4].spend).toBe(10);
    expect(days[5]).toEqual(day("2026-08-06"));
    expect(days[6].clicks).toBe(5);
  });
});

describe("aggregatePerformanceDays", () => {
  it("sums metrics and derives CTR / ROAS", () => {
    const totals = aggregatePerformanceDays([
      day("2026-08-01", {
        impressions: 100,
        clicks: 10,
        spend: 20,
        conversions: 2,
        conversionsValue: 40,
        purchases: 1,
        purchaseValue: 25,
      }),
      day("2026-08-02", {
        impressions: 50,
        clicks: 5,
        spend: 5,
        conversions: 1,
        conversionsValue: 10,
        purchases: 0,
        purchaseValue: 0,
      }),
    ]);
    expect(totals.impressions).toBe(150);
    expect(totals.clicks).toBe(15);
    expect(totals.spend).toBe(25);
    expect(totals.conversions).toBe(3);
    expect(totals.conversionsValue).toBe(50);
    expect(totals.purchases).toBe(1);
    expect(totals.purchaseValue).toBe(25);
    expect(totals.ctr).toBeCloseTo(0.1);
    expect(totals.roas).toBeCloseTo(2);
  });
});
