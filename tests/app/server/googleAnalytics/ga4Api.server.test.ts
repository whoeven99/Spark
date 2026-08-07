import { describe, expect, it } from "vitest";
import {
  mergeGa4Rows,
  mergeGa4Summaries,
  mergeGa4TimeSeries,
} from "../../../../app/server/googleAnalytics/ga4Api.server";

describe("ga4Api merge helpers", () => {
  it("merges summaries by summing metrics", () => {
    const merged = mergeGa4Summaries([
      { totalUsers: 10, totalSessions: 20, totalPageViews: 30, totalRevenue: 4 },
      { totalUsers: 5, totalSessions: 8, totalPageViews: 12, totalRevenue: 1.5 },
    ]);

    expect(merged).toEqual({
      totalUsers: 15,
      totalSessions: 28,
      totalPageViews: 42,
      totalRevenue: 5.5,
    });
  });

  it("merges rows by dimension key", () => {
    const merged = mergeGa4Rows([
      [
        { key: "organic", users: 10, sessions: 12, pageViews: 20, revenue: 1 },
        { key: "paid", users: 5, sessions: 6, pageViews: 8, revenue: 2 },
      ],
      [
        { key: "organic", users: 3, sessions: 4, pageViews: 5, revenue: 0.5 },
        { key: "referral", users: 2, sessions: 2, pageViews: 3, revenue: 0 },
      ],
    ]);

    expect(merged).toEqual(
      expect.arrayContaining([
        { key: "organic", users: 13, sessions: 16, pageViews: 25, revenue: 1.5 },
        { key: "paid", users: 5, sessions: 6, pageViews: 8, revenue: 2 },
        { key: "referral", users: 2, sessions: 2, pageViews: 3, revenue: 0 },
      ]),
    );
  });

  it("sorts merged time series by date", () => {
    const merged = mergeGa4TimeSeries([
      [{ key: "2026-07-02", users: 1, sessions: 1, pageViews: 1, revenue: 0 }],
      [{ key: "2026-07-01", users: 2, sessions: 2, pageViews: 2, revenue: 0 }],
    ]);

    expect(merged.map((row) => row.key)).toEqual(["2026-07-01", "2026-07-02"]);
  });
});
