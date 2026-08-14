import { describe, expect, it } from "vitest";
import {
  mergeGa4Rows,
  mergeGa4Summaries,
  mergeGa4TimeSeries,
} from "../../../../app/server/googleAnalytics/ga4Api.server";

const baseRow = {
  users: 10,
  sessions: 12,
  pageViews: 20,
  revenue: 1,
  purchases: 2,
  engagementRate: 0.6,
  bounceRate: 0.4,
  averageSessionDuration: 90,
  itemsViewed: 0,
  itemsAddedToCart: 0,
};

describe("ga4Api merge helpers", () => {
  it("merges summaries by summing metrics", () => {
    const merged = mergeGa4Summaries([
      {
        totalUsers: 10,
        newUsers: 4,
        totalSessions: 20,
        totalPageViews: 30,
        totalRevenue: 4,
        totalPurchases: 2,
        engagementRate: 0.5,
        bounceRate: 0.4,
        averageSessionDuration: 80,
      },
      {
        totalUsers: 5,
        newUsers: 2,
        totalSessions: 8,
        totalPageViews: 12,
        totalRevenue: 1.5,
        totalPurchases: 1,
        engagementRate: 0.75,
        bounceRate: 0.2,
        averageSessionDuration: 120,
      },
    ]);

    expect(merged).toEqual({
      totalUsers: 15,
      newUsers: 6,
      totalSessions: 28,
      totalPageViews: 42,
      totalRevenue: 5.5,
      totalPurchases: 3,
      engagementRate: (0.5 * 20 + 0.75 * 8) / 28,
      bounceRate: (0.4 * 20 + 0.2 * 8) / 28,
      averageSessionDuration: (80 * 20 + 120 * 8) / 28,
    });
  });

  it("merges rows by dimension key", () => {
    const merged = mergeGa4Rows([
      [
        { key: "organic", ...baseRow },
        {
          key: "paid",
          ...baseRow,
          users: 5,
          sessions: 6,
          pageViews: 8,
          revenue: 2,
          purchases: 1,
          engagementRate: 0.5,
          bounceRate: 0.3,
          averageSessionDuration: 60,
        },
      ],
      [
        {
          key: "organic",
          ...baseRow,
          users: 3,
          sessions: 4,
          pageViews: 5,
          revenue: 0.5,
          purchases: 1,
          engagementRate: 0.8,
          bounceRate: 0.2,
          averageSessionDuration: 120,
        },
        {
          key: "referral",
          ...baseRow,
          users: 2,
          sessions: 2,
          pageViews: 3,
          revenue: 0,
          purchases: 0,
          engagementRate: 0.4,
          bounceRate: 0.5,
          averageSessionDuration: 45,
        },
      ],
    ]);

    expect(merged).toEqual(
      expect.arrayContaining([
        {
          key: "organic",
          users: 13,
          sessions: 16,
          pageViews: 25,
          revenue: 1.5,
          purchases: 3,
          engagementRate: (0.6 * 12 + 0.8 * 4) / 16,
          bounceRate: (0.4 * 12 + 0.2 * 4) / 16,
          averageSessionDuration: (90 * 12 + 120 * 4) / 16,
          itemsViewed: 0,
          itemsAddedToCart: 0,
        },
        {
          key: "paid",
          users: 5,
          sessions: 6,
          pageViews: 8,
          revenue: 2,
          purchases: 1,
          engagementRate: 0.5,
          bounceRate: 0.3,
          averageSessionDuration: 60,
          itemsViewed: 0,
          itemsAddedToCart: 0,
        },
        {
          key: "referral",
          users: 2,
          sessions: 2,
          pageViews: 3,
          revenue: 0,
          purchases: 0,
          engagementRate: 0.4,
          bounceRate: 0.5,
          averageSessionDuration: 45,
          itemsViewed: 0,
          itemsAddedToCart: 0,
        },
      ]),
    );
  });

  it("merges product rows by item name", () => {
    const merged = mergeGa4Rows([
      [
        {
          key: "Shirt",
          users: 0,
          sessions: 0,
          pageViews: 0,
          revenue: 10,
          purchases: 2,
          engagementRate: 0,
          bounceRate: 0,
          averageSessionDuration: 0,
          itemsViewed: 50,
          itemsAddedToCart: 8,
        },
      ],
      [
        {
          key: "Shirt",
          users: 0,
          sessions: 0,
          pageViews: 0,
          revenue: 5,
          purchases: 1,
          engagementRate: 0,
          bounceRate: 0,
          averageSessionDuration: 0,
          itemsViewed: 20,
          itemsAddedToCart: 3,
        },
      ],
    ]);

    expect(merged).toEqual([
      {
        key: "Shirt",
        users: 0,
        sessions: 0,
        pageViews: 0,
        revenue: 15,
        purchases: 3,
        engagementRate: 0,
        bounceRate: 0,
        averageSessionDuration: 0,
        itemsViewed: 70,
        itemsAddedToCart: 11,
      },
    ]);
  });

  it("sorts merged time series by date", () => {
    const merged = mergeGa4TimeSeries([
      [{ key: "2026-07-02", ...baseRow, users: 1, sessions: 1, pageViews: 1, revenue: 0, purchases: 0 }],
      [{ key: "2026-07-01", ...baseRow, users: 2, sessions: 2, pageViews: 2, revenue: 0, purchases: 0 }],
    ]);

    expect(merged.map((row) => row.key)).toEqual(["2026-07-01", "2026-07-02"]);
  });
});
