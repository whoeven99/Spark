import { beforeEach, describe, expect, it, vi } from "vitest";

const groupByAdMetricDaily = vi.fn();
const groupByAdEntity = vi.fn();
const findManyAdInsightsSync = vi.fn();
const groupByGmc = vi.fn();
const groupByMeta = vi.fn();
const findManyCredential = vi.fn();
// 健康检查经 credentialStore 逐个 findUnique 读凭证，与连接矩阵的 findMany 是两条路径。
const findUniqueCredential = vi.fn();

vi.mock("~/db.server", () => ({
  default: {
    adMetricDaily: { groupBy: groupByAdMetricDaily },
    adEntity: { groupBy: groupByAdEntity },
    adInsightsSync: { findMany: findManyAdInsightsSync },
    gmcProductStatus: { groupBy: groupByGmc },
    metaProductStatus: { groupBy: groupByMeta },
    adPlatformCredential: {
      findMany: findManyCredential,
      findUnique: findUniqueCredential,
    },
  },
}));

const { buildAdsOverview } = await import("~/server/adsInsights/overview.server");
const { summarizeProductStatusGroups } = await import(
  "~/server/adsCatalog/productStatusSummary.server"
);

const NOW = new Date("2026-08-09T12:00:00.000Z");

function metricGroup(platform: string, sums: Partial<Record<string, number>>) {
  return {
    platform,
    _sum: {
      spend: sums.spend ?? 0,
      impressions: sums.impressions ?? 0,
      clicks: sums.clicks ?? 0,
      conversions: sums.conversions ?? 0,
      conversionsValue: sums.conversionsValue ?? 0,
    },
  };
}

beforeEach(() => {
  groupByAdMetricDaily.mockReset().mockResolvedValue([]);
  groupByAdEntity.mockReset().mockResolvedValue([]);
  findManyAdInsightsSync.mockReset().mockResolvedValue([]);
  groupByGmc.mockReset().mockResolvedValue([]);
  groupByMeta.mockReset().mockResolvedValue([]);
  findManyCredential.mockReset().mockResolvedValue([]);
  findUniqueCredential.mockReset().mockResolvedValue(null);
});

describe("summarizeProductStatusGroups", () => {
  it("counts every status group instead of a paged sample", () => {
    expect(
      summarizeProductStatusGroups([
        { status: "approved", _count: { _all: 812 } },
        { status: "pending", _count: { _all: 46 } },
        { status: "disapproved", _count: { _all: 73 } },
        { status: "expiring", _count: { _all: 5 } },
      ]),
    ).toEqual({ total: 936, approved: 812, pending: 46, disapproved: 73, other: 5 });
  });

  it("normalizes casing and treats unknown statuses as other", () => {
    expect(
      summarizeProductStatusGroups([
        { status: "APPROVED", _count: { _all: 2 } },
        { status: "weird", _count: { _all: 3 } },
      ]),
    ).toEqual({ total: 5, approved: 2, pending: 0, disapproved: 0, other: 3 });
  });
});

describe("buildAdsOverview", () => {
  it("resolves the UTC window from rangeDays", async () => {
    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });
    expect(overview.dateStart).toBe("2026-08-03");
    expect(overview.dateEnd).toBe("2026-08-09");
    expect(overview.rangeDays).toBe(7);
  });

  it("reports every platform as disconnected when no credential row exists", async () => {
    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });
    expect(overview.platforms.map((p) => p.platform)).toEqual(["meta", "google", "tiktok"]);
    expect(overview.platforms.every((p) => !p.connected)).toBe(true);
    expect(overview.totals.spend).toBe(0);
    expect(overview.totals.roas).toBeNull();
  });

  it("computes derived metrics and sums only connected platforms", async () => {
    findManyCredential.mockResolvedValue([
      { platform: "meta_ads", externalAccountId: "act_1", updatedAt: new Date("2026-08-01") },
      { platform: "google", externalAccountId: "482", updatedAt: new Date("2026-08-02") },
    ]);
    groupByAdMetricDaily.mockResolvedValue([
      metricGroup("meta", {
        spend: 100,
        clicks: 200,
        impressions: 10000,
        conversions: 10,
        conversionsValue: 400,
      }),
      metricGroup("google", {
        spend: 50,
        clicks: 100,
        impressions: 5000,
        conversions: 5,
        conversionsValue: 100,
      }),
      // 未连接平台的历史落库指标不应计入合计。
      metricGroup("tiktok", { spend: 999, conversionsValue: 999 }),
    ]);
    findManyAdInsightsSync.mockResolvedValue([
      {
        platform: "meta",
        accountId: "act_1",
        accountName: "Main",
        currencyCode: "USD",
        dateStart: "2026-07-11",
        dateEnd: "2026-08-09",
        fetchedAt: new Date("2026-08-09T11:50:00.000Z"),
      },
      {
        platform: "google",
        accountId: "482",
        accountName: null,
        currencyCode: "USD",
        dateStart: "2026-07-11",
        dateEnd: "2026-08-09",
        fetchedAt: new Date("2026-08-09T10:00:00.000Z"),
      },
    ]);

    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 30, now: NOW });

    expect(overview.totals.spend).toBe(150);
    expect(overview.totals.conversionsValue).toBe(500);
    expect(overview.totals.roas).toBeCloseTo(500 / 150);
    expect(overview.totals.ctr).toBeCloseTo(2);
    expect(overview.totals.cpc).toBeCloseTo(0.5);
    expect(overview.currencyCode).toBe("USD");
    expect(overview.mixedCurrency).toBe(false);

    const meta = overview.platforms.find((p) => p.platform === "meta")!;
    expect(meta.connected).toBe(true);
    expect(meta.snapshot?.stale).toBe(false);
    const google = overview.platforms.find((p) => p.platform === "google")!;
    // 2 小时前的快照超过 30 分钟 TTL。
    expect(google.snapshot?.stale).toBe(true);
    const tiktok = overview.platforms.find((p) => p.platform === "tiktok")!;
    expect(tiktok.connected).toBe(false);
  });

  it("flags mixed currency and drops the single-currency label", async () => {
    findManyCredential.mockResolvedValue([
      { platform: "meta_ads", externalAccountId: "act_1", updatedAt: new Date("2026-08-01") },
      { platform: "google", externalAccountId: "482", updatedAt: new Date("2026-08-02") },
    ]);
    groupByAdMetricDaily.mockResolvedValue([
      metricGroup("meta", { spend: 10, conversionsValue: 20 }),
      metricGroup("google", { spend: 10, conversionsValue: 20 }),
    ]);
    findManyAdInsightsSync.mockResolvedValue([
      {
        platform: "meta",
        accountId: "act_1",
        accountName: null,
        currencyCode: "USD",
        dateStart: "2026-07-11",
        dateEnd: "2026-08-09",
        fetchedAt: NOW,
      },
      {
        platform: "google",
        accountId: "482",
        accountName: null,
        currencyCode: "EUR",
        dateStart: "2026-07-11",
        dateEnd: "2026-08-09",
        fetchedAt: NOW,
      },
    ]);

    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });
    expect(overview.mixedCurrency).toBe(true);
    expect(overview.currencyCode).toBeNull();
  });

  it("aggregates entity counts and review status per channel", async () => {
    groupByAdEntity.mockResolvedValue([
      { platform: "meta", level: "campaign", _count: { _all: 4 } },
      { platform: "meta", level: "adSet", _count: { _all: 9 } },
      { platform: "meta", level: "ad", _count: { _all: 22 } },
    ]);
    groupByGmc.mockResolvedValue([
      { status: "approved", _count: { _all: 812 }, _max: { checkedAt: new Date("2026-08-09T09:00:00Z") } },
      { status: "disapproved", _count: { _all: 73 }, _max: { checkedAt: new Date("2026-08-09T10:00:00Z") } },
    ]);

    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });

    const meta = overview.platforms.find((p) => p.platform === "meta")!;
    expect(meta.entityCounts).toEqual({ campaign: 4, adSet: 9, ad: 22 });

    const gmc = overview.reviews.find((r) => r.channel === "gmc")!;
    expect(gmc.total).toBe(885);
    expect(gmc.disapproved).toBe(73);
    expect(gmc.lastCheckedAt).toBe("2026-08-09T10:00:00.000Z");

    const metaReview = overview.reviews.find((r) => r.channel === "meta")!;
    expect(metaReview.total).toBe(0);
    expect(metaReview.lastCheckedAt).toBeNull();
  });

  it("never selects the credentials payload for the connection matrix", async () => {
    await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });
    const select = findManyCredential.mock.calls[0]?.[0]?.select ?? {};
    expect(Object.keys(select).sort()).toEqual(["externalAccountId", "platform", "updatedAt"]);
    expect(select).not.toHaveProperty("credentials");
  });

  it("includes the integration health checks", async () => {
    findUniqueCredential.mockImplementation(async ({ where }) =>
      where.shop_platform.platform === "meta_ads"
        ? {
            credentials: {
              accessToken: "SECRET_TOKEN",
              adAccountId: "act_1",
              adAccountName: "Main",
            },
            updatedAt: new Date("2026-08-01"),
          }
        : null,
    );

    const overview = await buildAdsOverview({ shop: "s.myshopify.com", rangeDays: 7, now: NOW });

    expect(overview.health).toHaveLength(9);
    expect(overview.health.find((item) => item.key === "metaAds")).toMatchObject({
      state: "ok",
      reference: "Main",
    });
    expect(JSON.stringify(overview)).not.toContain("SECRET_TOKEN");
  });
});
