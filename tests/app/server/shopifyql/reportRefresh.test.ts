import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

const kvMocks = vi.hoisted(() => ({
  sparkKvSetNx: vi.fn(),
  sparkKvDel: vi.fn(),
}));

vi.mock("../../../../app/db.server", () => ({
  default: {
    shopifyReportSync: prismaMocks,
    shopifyReportSnapshot: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("../../../../app/server/kv/sparkKv.server", () => ({
  sparkKvSetNx: kvMocks.sparkKvSetNx,
  sparkKvDel: kvMocks.sparkKvDel,
  sparkKvGet: vi.fn(),
  sparkKvSet: vi.fn(),
  sparkKvKey: (...parts: Array<string | number>) => ["spark", ...parts.map(String)].join(":"),
}));

const { acquireReportShopLock, releaseReportShopLock } = await import(
  "../../../../app/server/shopifyql/reportRefresh.server"
);

const NOW = new Date("2026-08-21T04:00:00.000Z");

describe("shopify report shop lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not touch Turso when Redis already holds the shop lock", async () => {
    kvMocks.sparkKvSetNx.mockResolvedValue(false);

    await expect(
      acquireReportShopLock({ shop: "a.myshopify.com", tab: "sales", range: "7d", now: NOW }),
    ).resolves.toBe(false);
    expect(prismaMocks.findUnique).not.toHaveBeenCalled();
  });

  it("takes a Turso lock when Redis is not configured", async () => {
    kvMocks.sparkKvSetNx.mockResolvedValue(null);
    prismaMocks.findUnique.mockResolvedValue(null);
    prismaMocks.create.mockResolvedValue({});

    await expect(
      acquireReportShopLock({ shop: "a.myshopify.com", tab: "sales", range: "7d", now: NOW }),
    ).resolves.toBe(true);
    expect(prismaMocks.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a second lock while the Turso lock is still valid", async () => {
    kvMocks.sparkKvSetNx.mockResolvedValue(null);
    prismaMocks.findUnique.mockResolvedValue({
      status: "refreshing",
      lockUntil: new Date("2026-08-21T04:02:00.000Z"),
    });

    await expect(
      acquireReportShopLock({ shop: "a.myshopify.com", tab: "refunds", range: "30d", now: NOW }),
    ).resolves.toBe(false);
    expect(prismaMocks.update).not.toHaveBeenCalled();
  });

  it("releases both Redis and Turso locks", async () => {
    prismaMocks.updateMany.mockResolvedValue({ count: 1 });
    await releaseReportShopLock("a.myshopify.com");
    expect(kvMocks.sparkKvDel).toHaveBeenCalledTimes(1);
    expect(prismaMocks.updateMany).toHaveBeenCalledTimes(1);
  });
});
