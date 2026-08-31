import { afterEach, describe, expect, it, vi } from "vitest";

const archiveShopSnapshot = vi.fn();
const purgeShopDataFromTurso = vi.fn();

vi.mock("../../../../app/server/shopDataLifecycle/archiveShopSnapshot.server", () => ({
  archiveShopSnapshot: (...args: unknown[]) => archiveShopSnapshot(...args),
}));

vi.mock("../../../../app/server/shopDataLifecycle/purgeShopData.server", () => ({
  purgeShopDataFromTurso: (...args: unknown[]) => purgeShopDataFromTurso(...args),
}));

vi.mock("../../../../app/server/billing/promo/shopHash.server", () => ({
  hashShopDomain: () => "hash",
}));

describe("archiveAndPurgeShopData", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it("always purges even when archive hangs past budget", async () => {
    vi.useFakeTimers();
    archiveShopSnapshot.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );
    purgeShopDataFromTurso.mockResolvedValue({
      shop: "demo.myshopify.com",
      deleted: { Account: 1, CommonEventLog: 2 },
      errors: [],
    });

    const { archiveAndPurgeShopData } = await import(
      "../../../../app/server/shopDataLifecycle/archiveAndPurgeShop.server"
    );

    const pending = archiveAndPurgeShopData({
      shop: "demo.myshopify.com",
      mode: "uninstall",
    });
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;

    expect(purgeShopDataFromTurso).toHaveBeenCalledWith("demo.myshopify.com");
    expect(result.archive.ok).toBe(false);
    expect(result.archive.error).toContain("archive_timeout");
    expect(result.purge.deleted.Account).toBe(1);
  });

  it("purges after successful archive for uninstall and shop_redact", async () => {
    archiveShopSnapshot.mockResolvedValue({
      ok: true,
      shopHash: "hash",
      blobPath: "x",
      tableCounts: { CommonEventLog: 3 },
      truncatedTables: [],
    });
    purgeShopDataFromTurso.mockResolvedValue({
      shop: "demo.myshopify.com",
      deleted: { CommonEventLog: 3 },
      errors: [],
    });

    const { archiveAndPurgeShopData } = await import(
      "../../../../app/server/shopDataLifecycle/archiveAndPurgeShop.server"
    );

    await archiveAndPurgeShopData({
      shop: "demo.myshopify.com",
      mode: "uninstall",
    });
    await archiveAndPurgeShopData({
      shop: "demo.myshopify.com",
      mode: "shop_redact",
    });

    expect(purgeShopDataFromTurso).toHaveBeenNthCalledWith(1, "demo.myshopify.com");
    expect(purgeShopDataFromTurso).toHaveBeenNthCalledWith(2, "demo.myshopify.com");
  });
});
