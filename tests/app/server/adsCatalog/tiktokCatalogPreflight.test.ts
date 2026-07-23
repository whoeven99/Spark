import { describe, expect, it, vi } from "vitest";
import { buildTiktokProductResults } from "../../../../app/server/adsCatalog/clients/tiktokCatalogUploadConfirm.server";

describe("buildTiktokProductResults", () => {
  it("marks failed and successful skus", () => {
    const rows = buildTiktokProductResults({
      expectedSkuIds: ["sku-1", "sku-2", "sku-3"],
      confirmed: {
        succeeded: 2,
        errors: [{ id: "sku-2", reason: "invalid price" }],
        verifiedVia: "product_log",
      },
    });
    expect(rows).toEqual([
      { productId: "sku-1", status: "success" },
      { productId: "sku-2", status: "failed", reason: "invalid price" },
      { productId: "sku-3", status: "success" },
    ]);
  });
});

describe("preflightTiktokCatalogSync", () => {
  it("rejects sync when no catalog is bound", async () => {
    vi.doMock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
      getTiktokCatalogCredential: vi.fn().mockResolvedValue(null),
    }));
    const { preflightTiktokCatalogSync } = await import(
      "../../../../app/server/adsCatalog/tiktokCatalogPreflight.server"
    );
    const result = await preflightTiktokCatalogSync({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
      uploadMethod: "product_file",
    });
    expect(result.canSync).toBe(false);
    expect(result.error).toMatch(/绑定/);
  });
});
