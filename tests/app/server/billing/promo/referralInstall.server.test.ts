import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingError } from "../../../../../app/server/billing/errors.server";
import { hashShopDomain } from "../../../../../app/server/billing/promo/shopHash.server";

const installs = new Map<
  string,
  { id: string; codeId: string; shopHash: string; shop: string | null }
>();
const codes = new Map<
  string,
  { id: string; code: string; enabled: boolean; tokenAmount: number }
>();
const pendingByShop = new Map<string, string>();

vi.mock("../../../../../app/db.server", () => ({
  default: {
    referralInstall: {
      findUnique: vi.fn(async ({ where }: { where: { shopHash: string } }) => {
        return installs.get(where.shopHash) ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { codeId: string; shopHash: string; shop: string };
        }) => {
          if (installs.has(data.shopHash)) {
            const error = new Error("Unique constraint failed");
            (error as { code?: string }).code = "P2002";
            throw error;
          }
          const row = { id: `ins-${installs.size + 1}`, ...data };
          installs.set(data.shopHash, row);
          return row;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { shopHash: string };
          data: { shop: string | null };
        }) => {
          const row = installs.get(where.shopHash);
          if (!row) throw new Error("missing");
          row.shop = data.shop;
          return row;
        },
      ),
    },
    referralCode: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { code?: string; id?: string };
        }) => {
          if (where.code) {
            return (
              [...codes.values()].find((row) => row.code === where.code) ?? null
            );
          }
          if (where.id) return codes.get(where.id) ?? null;
          return null;
        },
      ),
    },
  },
}));

vi.mock("../../../../../app/server/billing/promo/referralCode.server", () => ({
  savePendingReferralCode: vi.fn(async (shop: string, code: string) => {
    if (code === "FULL-CODE") {
      throw new BillingError("已满", "REFERRAL_CODE_EXHAUSTED", 400);
    }
    pendingByShop.set(shop, code);
    return { code };
  }),
}));

const { captureReferralInstall } = await import(
  "../../../../../app/server/billing/promo/referralInstall.server"
);

describe("captureReferralInstall", () => {
  beforeEach(() => {
    installs.clear();
    codes.clear();
    pendingByShop.clear();
    codes.set("c1", {
      id: "c1",
      code: "KOL-SEP",
      enabled: true,
      tokenAmount: 1_000_000,
    });
  });

  it("首次带码记安装来源并预填 pending", async () => {
    const ok = await captureReferralInstall("ciwishop.myshopify.com", "kol-sep");
    expect(ok).toBe(true);
    const row = installs.get(hashShopDomain("ciwishop.myshopify.com"));
    expect(row?.codeId).toBe("c1");
    expect(row?.shop).toBe("ciwishop.myshopify.com");
    expect(pendingByShop.get("ciwishop.myshopify.com")).toBe("KOL-SEP");
  });

  it("同一店第二次带另一码不改来源", async () => {
    await captureReferralInstall("ciwishop.myshopify.com", "KOL-SEP");
    codes.set("c2", {
      id: "c2",
      code: "OTHER-1",
      enabled: true,
      tokenAmount: 1_000_000,
    });
    const again = await captureReferralInstall(
      "ciwishop.myshopify.com",
      "OTHER-1",
    );
    expect(again).toBe(false);
    expect(installs.get(hashShopDomain("ciwishop.myshopify.com"))?.codeId).toBe(
      "c1",
    );
  });

  it("无效码不记账", async () => {
    const ok = await captureReferralInstall("ciwishop.myshopify.com", "NOPE-1");
    expect(ok).toBe(false);
    expect(installs.size).toBe(0);
  });
});
