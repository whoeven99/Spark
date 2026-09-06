import prisma from "../../../db.server";
import { ensureAccount } from "../account/ensureAccount.server";
import { BillingError } from "../errors.server";
import { BILLING_LOG_EVENT } from "../types.server";
import { hashShopDomain } from "./shopHash.server";
import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "./referralCodeFormat";

const MAX_TX_ATTEMPTS = 3;

export const REFERRAL_ERROR_CODE = {
  INVALID: "REFERRAL_CODE_INVALID",
  EXHAUSTED: "REFERRAL_CODE_EXHAUSTED",
  ALREADY_CLAIMED: "REFERRAL_CODE_ALREADY_CLAIMED",
} as const;

export type ReferralRedeemSnapshot = {
  claimed: boolean;
  code: string | null;
  tokenAmount: number | null;
  pendingCode: string | null;
};

export type RedeemReferralCodeResult = {
  code: string;
  tokensDelta: number;
  alreadyClaimed: boolean;
};

class ReferralRedeemAbortedError extends Error {
  constructor(readonly reason: "exhausted" | "invalid") {
    super(reason);
    this.name = "ReferralRedeemAbortedError";
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

function isReferralCapped(maxUses: number): boolean {
  return Number.isFinite(maxUses) && maxUses > 0;
}

function isReferralExhausted(usedCount: number, maxUses: number): boolean {
  return isReferralCapped(maxUses) && usedCount >= maxUses;
}

function isCodeActive(
  row: {
    enabled: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  now: Date,
): boolean {
  if (!row.enabled) return false;
  const ts = now.getTime();
  if (row.startsAt && ts < row.startsAt.getTime()) return false;
  if (row.endsAt && ts > row.endsAt.getTime()) return false;
  return true;
}

export async function clearPendingReferralCode(shop: string): Promise<void> {
  await prisma.account.updateMany({
    where: { shop },
    data: { pendingReferralCode: null },
  });
}

/**
 * 订阅结账前写入待用码。空码会清掉旧待用，避免上次填写被误用。
 * 校验失败抛 BillingError，拦住结账。
 */
export async function savePendingReferralCode(
  shop: string,
  rawCode: string,
): Promise<{ code: string | null }> {
  const code = normalizeReferralCode(rawCode);
  if (!code) {
    await clearPendingReferralCode(shop);
    return { code: null };
  }
  if (!isValidReferralCodeFormat(code)) {
    throw new BillingError(
      "推荐码无效或已过期",
      REFERRAL_ERROR_CODE.INVALID,
      400,
    );
  }

  const shopHash = hashShopDomain(shop);
  const existing = await prisma.referralClaim.findUnique({
    where: { shopHash },
    select: { id: true },
  });
  if (existing) {
    throw new BillingError(
      "该店已使用过推荐码",
      REFERRAL_ERROR_CODE.ALREADY_CLAIMED,
      400,
    );
  }

  const now = new Date();
  const row = await prisma.referralCode.findUnique({
    where: { code },
    select: {
      tokenAmount: true,
      maxUses: true,
      usedCount: true,
      enabled: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!row || row.tokenAmount <= 0 || !isCodeActive(row, now)) {
    throw new BillingError(
      "推荐码无效或已过期",
      REFERRAL_ERROR_CODE.INVALID,
      400,
    );
  }
  if (isReferralExhausted(row.usedCount, row.maxUses)) {
    throw new BillingError(
      "该推荐码已达使用上限",
      REFERRAL_ERROR_CODE.EXHAUSTED,
      400,
    );
  }

  await ensureAccount(shop);
  await prisma.account.update({
    where: { shop },
    data: { pendingReferralCode: code },
  });
  return { code };
}

/**
 * 订阅确认成功后兑现待用码。无待用码则跳过。
 * 入账失败（无效/已满）只清待用，不阻断订阅。
 */
export async function fulfillPendingReferralOnSubscription(
  shop: string,
): Promise<RedeemReferralCodeResult | null> {
  const account = await prisma.account.findUnique({
    where: { shop },
    select: { pendingReferralCode: true },
  });
  const pending = account?.pendingReferralCode?.trim() ?? "";
  if (!pending) return null;

  try {
    const result = await redeemReferralCode(shop, pending);
    await clearPendingReferralCode(shop);
    return result;
  } catch (error) {
    if (error instanceof BillingError) {
      await clearPendingReferralCode(shop).catch(() => undefined);
      console.warn(
        `[Referral] fulfill skipped shop=${shop} code=${pending} reason=${error.code}`,
      );
      return null;
    }
    console.error(`[Referral] fulfill failed shop=${shop} code=${pending}`, error);
    return null;
  }
}

export async function loadReferralRedeemSnapshot(
  shop: string,
): Promise<ReferralRedeemSnapshot> {
  const shopHash = hashShopDomain(shop);
  const [claim, account] = await Promise.all([
    prisma.referralClaim.findUnique({
      where: { shopHash },
      select: {
        tokensDelta: true,
        code: { select: { code: true } },
      },
    }),
    prisma.account.findUnique({
      where: { shop },
      select: { pendingReferralCode: true },
    }),
  ]);
  const pendingCode = account?.pendingReferralCode?.trim() || null;
  if (!claim) {
    return { claimed: false, code: null, tokenAmount: null, pendingCode };
  }
  return {
    claimed: true,
    code: claim.code.code,
    tokenAmount: claim.tokensDelta,
    pendingCode: null,
  };
}

/**
 * 兑换推荐码：同一事务内先占 ReferralClaim（shopHash 唯一），再条件占用名额，最后加 Token。
 * 并发连点 / 自调 API 第二次必 P2002，tokensDelta = 0。
 */
export async function redeemReferralCode(
  shop: string,
  rawCode: string,
): Promise<RedeemReferralCodeResult> {
  const code = normalizeReferralCode(rawCode);
  if (!isValidReferralCodeFormat(code)) {
    throw new BillingError(
      "推荐码无效或已过期",
      REFERRAL_ERROR_CODE.INVALID,
      400,
    );
  }

  const shopHash = hashShopDomain(shop);
  const existing = await prisma.referralClaim.findUnique({
    where: { shopHash },
    select: { id: true, code: { select: { code: true } } },
  });
  if (existing) {
    return {
      code: existing.code.code,
      tokensDelta: 0,
      alreadyClaimed: true,
    };
  }

  const now = new Date();
  const row = await prisma.referralCode.findUnique({
    where: { code },
    select: {
      id: true,
      tokenAmount: true,
      maxUses: true,
      usedCount: true,
      enabled: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!row || row.tokenAmount <= 0 || !isCodeActive(row, now)) {
    throw new BillingError(
      "推荐码无效或已过期",
      REFERRAL_ERROR_CODE.INVALID,
      400,
    );
  }
  if (isReferralExhausted(row.usedCount, row.maxUses)) {
    throw new BillingError(
      "该推荐码已达使用上限",
      REFERRAL_ERROR_CODE.EXHAUSTED,
      400,
    );
  }

  await ensureAccount(shop);

  for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.referralClaim.create({
          data: {
            codeId: row.id,
            shopHash,
            tokensDelta: row.tokenAmount,
          },
        });

        const occupied = await tx.$executeRaw`
          UPDATE "ReferralCode"
          SET "usedCount" = "usedCount" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${row.id}
            AND "enabled" = 1
            AND ("maxUses" <= 0 OR "usedCount" < "maxUses")
            AND ("startsAt" IS NULL OR "startsAt" <= CURRENT_TIMESTAMP)
            AND ("endsAt" IS NULL OR "endsAt" >= CURRENT_TIMESTAMP)
        `;
        if (occupied !== 1) {
          throw new ReferralRedeemAbortedError("exhausted");
        }

        await tx.account.update({
          where: { shop },
          data: {
            purchasedTokens: { increment: row.tokenAmount },
          },
        });

        await tx.billingLog.create({
          data: {
            shop,
            eventType: BILLING_LOG_EVENT.REFERRAL_CODE_CLAIMED,
            referenceId: code,
            tokensDelta: row.tokenAmount,
            metadata: {
              source: "referral_code",
              code,
              shopHash,
            },
          },
        });
      });

      return {
        code,
        tokensDelta: row.tokenAmount,
        alreadyClaimed: false,
      };
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return {
          code,
          tokensDelta: 0,
          alreadyClaimed: true,
        };
      }
      if (error instanceof ReferralRedeemAbortedError) {
        throw new BillingError(
          "该推荐码已达使用上限",
          REFERRAL_ERROR_CODE.EXHAUSTED,
          400,
        );
      }
      if (isPrismaCode(error, "P2034") && attempt < MAX_TX_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  throw new BillingError(
    "推荐码兑换失败，请重试",
    REFERRAL_ERROR_CODE.INVALID,
    400,
  );
}
