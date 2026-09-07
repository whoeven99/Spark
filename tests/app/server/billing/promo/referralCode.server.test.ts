import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingError } from "../../../../../app/server/billing/errors.server";
import { BILLING_LOG_EVENT } from "../../../../../app/server/billing/types.server";
import { hashShopDomain } from "../../../../../app/server/billing/promo/shopHash.server";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "../../../../../app/server/billing/promo/referralCodeFormat";
import {
  fulfillPendingReferralOnSubscription,
  redeemReferralCode,
  savePendingReferralCode,
} from "../../../../../app/server/billing/promo/referralCode.server";

type CodeRow = {
  id: string;
  code: string;
  tokenAmount: number;
  maxUses: number;
  usedCount: number;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

type ClaimRow = {
  id: string;
  codeId: string;
  shopHash: string;
  tokensDelta: number;
};

type AccountRow = {
  purchasedTokens: number;
  pendingReferralCode: string | null;
};

type Store = {
  codes: Map<string, CodeRow>;
  claimsByHash: Map<string, ClaimRow>;
  accounts: Map<string, AccountRow>;
  logs: Array<{ shop: string; eventType: string; referenceId: string | null; tokensDelta: number }>;
};

const store: Store = {
  codes: new Map(),
  claimsByHash: new Map(),
  accounts: new Map(),
  logs: [],
};

let txQueue: Promise<void> = Promise.resolve();

function snapshotStore(): Store {
  return {
    codes: new Map(
      [...store.codes.entries()].map(([key, value]) => [key, { ...value }]),
    ),
    claimsByHash: new Map(
      [...store.claimsByHash.entries()].map(([key, value]) => [key, { ...value }]),
    ),
    accounts: new Map(
      [...store.accounts.entries()].map(([key, value]) => [key, { ...value }]),
    ),
    logs: store.logs.map((row) => ({ ...row })),
  };
}

function restoreStore(snap: Store) {
  store.codes.clear();
  for (const [key, value] of snap.codes) store.codes.set(key, { ...value });
  store.claimsByHash.clear();
  for (const [key, value] of snap.claimsByHash) {
    store.claimsByHash.set(key, { ...value });
  }
  store.accounts.clear();
  for (const [key, value] of snap.accounts) store.accounts.set(key, { ...value });
  store.logs.splice(0, store.logs.length, ...snap.logs.map((row) => ({ ...row })));
}

function uniqueViolation(): Error {
  const error = new Error("Unique constraint failed");
  (error as { code?: string }).code = "P2002";
  return error;
}

function makeTx() {
  return {
    referralClaim: {
      create: async ({ data }: { data: Omit<ClaimRow, "id"> }) => {
        if (store.claimsByHash.has(data.shopHash)) {
          throw uniqueViolation();
        }
        const row: ClaimRow = { id: `claim-${store.claimsByHash.size + 1}`, ...data };
        store.claimsByHash.set(data.shopHash, row);
        return row;
      },
    },
    $executeRaw: async (_strings: TemplateStringsArray, codeId: string) => {
      const code = store.codes.get(codeId);
      if (
        !code ||
        !code.enabled ||
        (code.maxUses > 0 && code.usedCount >= code.maxUses)
      ) {
        return 0;
      }
      code.usedCount += 1;
      return 1;
    },
    account: {
      update: async ({
        where,
        data,
      }: {
        where: { shop: string };
        data: {
          purchasedTokens?: { increment: number };
          pendingReferralCode?: string | null;
        };
      }) => {
        const account = store.accounts.get(where.shop);
        if (!account) throw new Error("account missing");
        if (data.purchasedTokens) {
          account.purchasedTokens += data.purchasedTokens.increment;
        }
        if (data.pendingReferralCode !== undefined) {
          account.pendingReferralCode = data.pendingReferralCode;
        }
        return account;
      },
    },
    billingLog: {
      create: async ({
        data,
      }: {
        data: {
          shop: string;
          eventType: string;
          referenceId: string;
          tokensDelta: number;
        };
      }) => {
        store.logs.push({
          shop: data.shop,
          eventType: data.eventType,
          referenceId: data.referenceId,
          tokensDelta: data.tokensDelta,
        });
        return data;
      },
    },
  };
}

vi.mock("../../../../../app/db.server", () => ({
  default: {
    referralCode: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { code?: string; id?: string };
        }) => {
          if (where.code) {
            return (
              [...store.codes.values()].find((row) => row.code === where.code) ??
              null
            );
          }
          if (where.id) return store.codes.get(where.id) ?? null;
          return null;
        },
      ),
    },
    referralClaim: {
      findUnique: vi.fn(async ({ where }: { where: { shopHash: string } }) => {
        const claim = store.claimsByHash.get(where.shopHash);
        if (!claim) return null;
        const code = store.codes.get(claim.codeId);
        return {
          ...claim,
          code: { code: code?.code ?? "" },
        };
      }),
    },
    account: {
      upsert: vi.fn(async ({ where }: { where: { shop: string } }) => {
        const current = store.accounts.get(where.shop) ?? {
          purchasedTokens: 0,
          pendingReferralCode: null,
        };
        store.accounts.set(where.shop, current);
        return { shop: where.shop, ...current };
      }),
      findUnique: vi.fn(async ({ where }: { where: { shop: string } }) => {
        const current = store.accounts.get(where.shop);
        return current ? { shop: where.shop, ...current } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { shop: string };
          data: {
            purchasedTokens?: { increment: number };
            pendingReferralCode?: string | null;
          };
        }) => {
          const current = store.accounts.get(where.shop) ?? {
            purchasedTokens: 0,
            pendingReferralCode: null,
          };
          if (data.purchasedTokens) {
            current.purchasedTokens += data.purchasedTokens.increment;
          }
          if (data.pendingReferralCode !== undefined) {
            current.pendingReferralCode = data.pendingReferralCode;
          }
          store.accounts.set(where.shop, current);
          return { shop: where.shop, ...current };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { shop: string };
          data: { pendingReferralCode?: string | null };
        }) => {
          const current = store.accounts.get(where.shop);
          if (!current) return { count: 0 };
          if (data.pendingReferralCode !== undefined) {
            current.pendingReferralCode = data.pendingReferralCode;
          }
          return { count: 1 };
        },
      ),
    },
    $transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      const run = txQueue.then(async () => {
        const snap = snapshotStore();
        try {
          return await callback(makeTx());
        } catch (error) {
          restoreStore(snap);
          throw error;
        }
      });
      txQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  },
}));

function seedCode(overrides?: Partial<CodeRow>): CodeRow {
  const row: CodeRow = {
    id: overrides?.id ?? "code-1",
    code: overrides?.code ?? "KOL-SEP",
    tokenAmount: overrides?.tokenAmount ?? 1_000_000,
    maxUses: overrides?.maxUses ?? 10,
    usedCount: overrides?.usedCount ?? 0,
    enabled: overrides?.enabled ?? true,
    startsAt: overrides?.startsAt ?? null,
    endsAt: overrides?.endsAt ?? null,
  };
  store.codes.set(row.id, row);
  return row;
}

describe("referralCodeFormat", () => {
  it("规范化大小写与空格", () => {
    expect(normalizeReferralCode(" kol-sep ")).toBe("KOL-SEP");
  });

  it("拒绝过短或非法字符", () => {
    expect(isValidReferralCodeFormat("ABC")).toBe(false);
    expect(isValidReferralCodeFormat("HELLO WORLD")).toBe(false);
    expect(isValidReferralCodeFormat("KOL-SEP")).toBe(true);
  });

  it("生成 SPARK- 前缀码", () => {
    const code = generateReferralCode();
    expect(code.startsWith("SPARK-")).toBe(true);
    expect(isValidReferralCodeFormat(code)).toBe(true);
  });
});

describe("redeemReferralCode", () => {
  beforeEach(() => {
    store.codes.clear();
    store.claimsByHash.clear();
    store.accounts.clear();
    store.logs.length = 0;
    txQueue = Promise.resolve();
  });

  it("同店两次串行：第二次 alreadyClaimed，Token 只加一次", async () => {
    seedCode();
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });

    const first = await redeemReferralCode("a.myshopify.com", "kol-sep");
    const second = await redeemReferralCode("a.myshopify.com", "kol-sep");

    expect(first).toEqual({
      code: "KOL-SEP",
      tokensDelta: 1_000_000,
      alreadyClaimed: false,
    });
    expect(second.alreadyClaimed).toBe(true);
    expect(second.tokensDelta).toBe(0);
    expect(store.accounts.get("a.myshopify.com")?.purchasedTokens).toBe(1_000_000);
    expect(store.claimsByHash.size).toBe(1);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]?.eventType).toBe(BILLING_LOG_EVENT.REFERRAL_CODE_CLAIMED);
    expect(store.codes.get("code-1")?.usedCount).toBe(1);
  });

  it("同店两次并行：恰好一单成功，Account 只加一份", async () => {
    seedCode();
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });

    const results = await Promise.all([
      redeemReferralCode("a.myshopify.com", "KOL-SEP"),
      redeemReferralCode("a.myshopify.com", "KOL-SEP"),
    ]);

    const successes = results.filter((row) => !row.alreadyClaimed);
    const duplicates = results.filter((row) => row.alreadyClaimed);
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(successes[0]?.tokensDelta).toBe(1_000_000);
    expect(store.accounts.get("a.myshopify.com")?.purchasedTokens).toBe(1_000_000);
    expect(store.claimsByHash.size).toBe(1);
    expect(store.logs).toHaveLength(1);
    expect(store.codes.get("code-1")?.usedCount).toBe(1);
  });

  it("两店抢 maxUses=1：恰好一店成功", async () => {
    seedCode({ maxUses: 1 });
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    store.accounts.set("b.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });

    const results = await Promise.allSettled([
      redeemReferralCode("a.myshopify.com", "KOL-SEP"),
      redeemReferralCode("b.myshopify.com", "KOL-SEP"),
    ]);

    const fulfilled = results.filter(
      (row): row is PromiseFulfilledResult<Awaited<ReturnType<typeof redeemReferralCode>>> =>
        row.status === "fulfilled",
    );
    const rejected = results.filter((row) => row.status === "rejected");
    expect(fulfilled.filter((row) => !row.value.alreadyClaimed)).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === "rejected" && rejected[0].reason).toBeInstanceOf(
      BillingError,
    );
    expect(store.codes.get("code-1")?.usedCount).toBe(1);
    expect(store.claimsByHash.size).toBe(1);
    expect(store.logs).toHaveLength(1);
    const granted =
      (store.accounts.get("a.myshopify.com")?.purchasedTokens ?? 0) +
      (store.accounts.get("b.myshopify.com")?.purchasedTokens ?? 0);
    expect(granted).toBe(1_000_000);
    expect(hashShopDomain("a.myshopify.com")).not.toBe(
      hashShopDomain("b.myshopify.com"),
    );
  });

  it("maxUses=0 不限次数：两店都能入账", async () => {
    seedCode({ maxUses: 0 });
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    store.accounts.set("b.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });

    const first = await redeemReferralCode("a.myshopify.com", "KOL-SEP");
    const second = await redeemReferralCode("b.myshopify.com", "KOL-SEP");

    expect(first.alreadyClaimed).toBe(false);
    expect(second.alreadyClaimed).toBe(false);
    expect(store.codes.get("code-1")?.usedCount).toBe(2);
    expect(store.claimsByHash.size).toBe(2);
  });

  it("无效码不入账", async () => {
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    await expect(redeemReferralCode("a.myshopify.com", "NOPE-1")).rejects.toMatchObject({
      code: "REFERRAL_CODE_INVALID",
    });
    expect(store.accounts.get("a.myshopify.com")?.purchasedTokens).toBe(0);
  });
});

describe("pending referral on subscription", () => {
  beforeEach(() => {
    store.codes.clear();
    store.claimsByHash.clear();
    store.accounts.clear();
    store.logs.length = 0;
    txQueue = Promise.resolve();
  });

  it("savePending 只写待用码，不入账", async () => {
    seedCode();
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });

    const saved = await savePendingReferralCode("a.myshopify.com", " kol-sep ");
    expect(saved).toEqual({ code: "KOL-SEP" });
    expect(store.accounts.get("a.myshopify.com")).toEqual({
      purchasedTokens: 0,
      pendingReferralCode: "KOL-SEP",
    });
    expect(store.claimsByHash.size).toBe(0);
    expect(store.codes.get("code-1")?.usedCount).toBe(0);
  });

  it("空码清掉旧待用", async () => {
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: "KOL-SEP",
    });

    await expect(savePendingReferralCode("a.myshopify.com", "  ")).resolves.toEqual({
      code: null,
    });
    expect(store.accounts.get("a.myshopify.com")?.pendingReferralCode).toBeNull();
  });

  it("无效码拦住、不写 pending", async () => {
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    await expect(
      savePendingReferralCode("a.myshopify.com", "NOPE-1"),
    ).rejects.toMatchObject({ code: "REFERRAL_CODE_INVALID" });
    expect(store.accounts.get("a.myshopify.com")?.pendingReferralCode).toBeNull();
  });

  it("fulfill 入账后清 pending", async () => {
    seedCode();
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: "KOL-SEP",
    });

    const result = await fulfillPendingReferralOnSubscription("a.myshopify.com");
    expect(result).toEqual({
      code: "KOL-SEP",
      tokensDelta: 1_000_000,
      alreadyClaimed: false,
    });
    expect(store.accounts.get("a.myshopify.com")).toEqual({
      purchasedTokens: 1_000_000,
      pendingReferralCode: null,
    });
    expect(store.claimsByHash.size).toBe(1);
    expect(store.codes.get("code-1")?.usedCount).toBe(1);
  });

  it("无 pending 则 noop", async () => {
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    await expect(
      fulfillPendingReferralOnSubscription("a.myshopify.com"),
    ).resolves.toBeNull();
    expect(store.accounts.get("a.myshopify.com")?.purchasedTokens).toBe(0);
  });

  it("fulfill 时码已失效：清 pending、不入账", async () => {
    seedCode({ enabled: false });
    store.accounts.set("a.myshopify.com", {
      purchasedTokens: 0,
      pendingReferralCode: "KOL-SEP",
    });

    await expect(
      fulfillPendingReferralOnSubscription("a.myshopify.com"),
    ).resolves.toBeNull();
    expect(store.accounts.get("a.myshopify.com")).toEqual({
      purchasedTokens: 0,
      pendingReferralCode: null,
    });
    expect(store.claimsByHash.size).toBe(0);
  });
});
