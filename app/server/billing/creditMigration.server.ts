import prisma from "../../db.server";
import { BILLING_LOG_EVENT } from "./types.server";
import { normalizeShopDomain } from "./promo/shopHash.server";

const SOURCE = "tsf_migration";

export type CreditMigrationGrantOk = {
  ok: true;
  alreadyApplied: boolean;
  shop: string;
  transferId: string;
  amount: number;
  purchasedBefore: number;
  purchasedAfter: number;
  usedTokens: number;
};

export type CreditMigrationGrantErr = {
  ok: false;
  errorCode: "SPARK_NOT_INSTALLED" | "INVALID_AMOUNT" | "ALREADY_ROLLED_BACK";
  shop: string;
  transferId: string;
};

export type CreditMigrationRollbackOk = {
  ok: true;
  alreadyApplied: boolean;
  shop: string;
  transferId: string;
  amount: number;
  purchasedBefore: number;
  purchasedAfter: number;
};

export type CreditMigrationRollbackErr = {
  ok: false;
  errorCode: "GRANT_NOT_FOUND" | "INVALID_TRANSFER";
  shop: string;
  transferId: string;
};

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function parseTransferId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 80) return null;
  return id;
}

async function findLog(
  shop: string,
  eventType: string,
  transferId: string,
) {
  return prisma.billingLog.findFirst({
    where: { shop, eventType, referenceId: transferId },
    orderBy: { createdAt: "desc" },
  });
}

export async function grantMigratedCredits(params: {
  shop: unknown;
  amount: unknown;
  transferId: unknown;
}): Promise<CreditMigrationGrantOk | CreditMigrationGrantErr> {
  const shop = normalizeShopDomain(String(params.shop ?? ""));
  const transferId = parseTransferId(params.transferId) ?? "";
  const amount = parseAmount(params.amount);

  if (!shop || !transferId) {
    return {
      ok: false,
      errorCode: "INVALID_AMOUNT",
      shop,
      transferId,
    };
  }

  const account = await prisma.account.findUnique({
    where: { shop },
    select: { shop: true, purchasedTokens: true, usedTokens: true },
  });
  if (!account) {
    return {
      ok: false,
      errorCode: "SPARK_NOT_INSTALLED",
      shop,
      transferId,
    };
  }

  if (amount == null || amount < 1) {
    await prisma.billingLog.create({
      data: {
        shop,
        eventType: BILLING_LOG_EVENT.CREDIT_MIGRATION_FAILED,
        referenceId: transferId,
        tokensDelta: 0,
        usedTokens: account.usedTokens,
        metadata: {
          source: SOURCE,
          status: "failed",
          errorCode: "INVALID_AMOUNT",
          amount: amount ?? 0,
        },
      },
    });
    return {
      ok: false,
      errorCode: "INVALID_AMOUNT",
      shop,
      transferId,
    };
  }

  const existingIn = await findLog(
    shop,
    BILLING_LOG_EVENT.CREDIT_MIGRATION_IN,
    transferId,
  );
  if (existingIn) {
    const rolledBack = await findLog(
      shop,
      BILLING_LOG_EVENT.CREDIT_MIGRATION_ROLLBACK,
      transferId,
    );
    if (rolledBack) {
      return {
        ok: false,
        errorCode: "ALREADY_ROLLED_BACK",
        shop,
        transferId,
      };
    }
    const meta = (existingIn.metadata ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      alreadyApplied: true,
      shop,
      transferId,
      amount: Number(existingIn.tokensDelta ?? amount),
      purchasedBefore: Number(meta.purchasedBefore ?? account.purchasedTokens),
      purchasedAfter: Number(meta.purchasedAfter ?? account.purchasedTokens),
      usedTokens: account.usedTokens,
    };
  }

  const purchasedBefore = account.purchasedTokens;
  const purchasedAfter = purchasedBefore + amount;

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { shop },
      data: { purchasedTokens: { increment: amount } },
    });
    await tx.billingLog.create({
      data: {
        shop,
        eventType: BILLING_LOG_EVENT.CREDIT_MIGRATION_IN,
        referenceId: transferId,
        tokensDelta: amount,
        usedTokens: account.usedTokens,
        metadata: {
          source: SOURCE,
          status: "ok",
          amount,
          purchasedBefore,
          purchasedAfter,
        },
      },
    });
  });

  return {
    ok: true,
    alreadyApplied: false,
    shop,
    transferId,
    amount,
    purchasedBefore,
    purchasedAfter,
    usedTokens: account.usedTokens,
  };
}

export async function rollbackMigratedCredits(params: {
  shop: unknown;
  transferId: unknown;
}): Promise<CreditMigrationRollbackOk | CreditMigrationRollbackErr> {
  const shop = normalizeShopDomain(String(params.shop ?? ""));
  const transferId = parseTransferId(params.transferId) ?? "";
  if (!shop || !transferId) {
    return {
      ok: false,
      errorCode: "INVALID_TRANSFER",
      shop,
      transferId,
    };
  }

  const existingIn = await findLog(
    shop,
    BILLING_LOG_EVENT.CREDIT_MIGRATION_IN,
    transferId,
  );
  if (!existingIn) {
    return {
      ok: false,
      errorCode: "GRANT_NOT_FOUND",
      shop,
      transferId,
    };
  }

  const existingRollback = await findLog(
    shop,
    BILLING_LOG_EVENT.CREDIT_MIGRATION_ROLLBACK,
    transferId,
  );
  const amount = Math.max(0, Number(existingIn.tokensDelta ?? 0));
  const account = await prisma.account.findUnique({
    where: { shop },
    select: { purchasedTokens: true, usedTokens: true },
  });
  const purchasedNow = account?.purchasedTokens ?? 0;

  if (existingRollback) {
    const meta = (existingRollback.metadata ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      alreadyApplied: true,
      shop,
      transferId,
      amount,
      purchasedBefore: Number(meta.purchasedBefore ?? purchasedNow),
      purchasedAfter: Number(meta.purchasedAfter ?? purchasedNow),
    };
  }

  const purchasedBefore = purchasedNow;
  const purchasedAfter = Math.max(0, purchasedBefore - amount);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { shop },
      data: { purchasedTokens: purchasedAfter },
    });
    await tx.billingLog.create({
      data: {
        shop,
        eventType: BILLING_LOG_EVENT.CREDIT_MIGRATION_ROLLBACK,
        referenceId: transferId,
        tokensDelta: -amount,
        usedTokens: account?.usedTokens ?? 0,
        metadata: {
          source: SOURCE,
          status: "rolled_back",
          amount,
          purchasedBefore,
          purchasedAfter,
        },
      },
    });
  });

  return {
    ok: true,
    alreadyApplied: false,
    shop,
    transferId,
    amount,
    purchasedBefore,
    purchasedAfter,
  };
}
