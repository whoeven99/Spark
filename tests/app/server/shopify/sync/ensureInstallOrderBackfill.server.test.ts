import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const backfillOrders = vi.fn();

vi.mock("../../../../../app/db.server", () => ({
  default: {
    shopSyncCheckpoint: {
      findUnique,
      upsert,
    },
  },
}));

vi.mock("../../../../../app/server/shopify/sync/backfill.server", () => ({
  backfillOrders,
}));

describe("resolveOrderBackfillDays", () => {
  it("defaults to 30 and clamps invalid values", async () => {
    const { resolveOrderBackfillDays, ORDER_BACKFILL_DAYS_DEFAULT } = await import(
      "../../../../../app/server/shopify/sync/orderBackfillConfig.server"
    );

    expect(ORDER_BACKFILL_DAYS_DEFAULT).toBe(30);
    expect(resolveOrderBackfillDays(undefined)).toBe(30);
    expect(resolveOrderBackfillDays("")).toBe(30);
    expect(resolveOrderBackfillDays("abc")).toBe(30);
    expect(resolveOrderBackfillDays("7")).toBe(7);
    expect(resolveOrderBackfillDays("0")).toBe(1);
    expect(resolveOrderBackfillDays("999")).toBe(365);
  });
});

describe("ensureInstallOrderBackfill", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    backfillOrders.mockReset();
    upsert.mockResolvedValue({});
    backfillOrders.mockResolvedValue({ synced: 2, skipped: 0, errors: 0, cursor: null });
    delete process.env.SPARK_ORDER_BACKFILL_DAYS;
  });

  it("skips when bootstrap checkpoint is already done", async () => {
    findUnique.mockResolvedValue({
      lastCursor: "done",
      lastSyncedAt: new Date(),
    });

    const { ensureInstallOrderBackfill } = await import(
      "../../../../../app/server/shopify/sync/ensureInstallOrderBackfill.server"
    );

    await ensureInstallOrderBackfill("demo.myshopify.com", {} as never);

    expect(backfillOrders).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("runs when forced even if previously done, using env days", async () => {
    process.env.SPARK_ORDER_BACKFILL_DAYS = "45";
    findUnique.mockResolvedValue({
      lastCursor: "done",
      lastSyncedAt: new Date(),
    });

    const { ensureInstallOrderBackfill } = await import(
      "../../../../../app/server/shopify/sync/ensureInstallOrderBackfill.server"
    );

    await ensureInstallOrderBackfill("demo.myshopify.com", {} as never, { force: true });

    expect(backfillOrders).toHaveBeenCalledWith("demo.myshopify.com", {}, {
      daysBack: 45,
    });
    expect(upsert).toHaveBeenCalled();
  });

  it("runs once for shops that never bootstrapped with default 30 days", async () => {
    findUnique.mockResolvedValue(null);

    const { ensureInstallOrderBackfill } = await import(
      "../../../../../app/server/shopify/sync/ensureInstallOrderBackfill.server"
    );

    await ensureInstallOrderBackfill("fresh.myshopify.com", {} as never);

    expect(backfillOrders).toHaveBeenCalledWith("fresh.myshopify.com", {}, {
      daysBack: 30,
    });
    expect(upsert.mock.calls.some((call) => call[0]?.update?.lastCursor === "done")).toBe(true);
  });
});
