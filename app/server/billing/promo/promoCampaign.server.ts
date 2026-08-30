import prisma from "../../../db.server";
import { ensureAccount } from "../account/ensureAccount.server";
import { BillingError } from "../errors.server";
import { BILLING_LOG_EVENT } from "../types.server";
import {
  hasPromoClaimLedgerEntry,
  recordPromoClaimLedger,
} from "./promoClaimLedger.server";

const DEFAULT_CAMPAIGN_ID = "install-welcome-1m";
const DEFAULT_TOKEN_AMOUNT = 1_000_000;

export type PromoCampaignDefinition = {
  id: string;
  enabled: boolean;
  tokenAmount: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type PromoCampaignSnapshot = {
  campaignId: string;
  tokenAmount: number;
  claimed: boolean;
};

function parseOptionalDate(raw: string | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseTokenAmount(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TOKEN_AMOUNT;
  }
  return parsed;
}

/** 从环境变量解析活动配置；未设时默认：安装可领 1000000 Token。 */
export function resolvePromoCampaignConfig(
  env: NodeJS.ProcessEnv = process.env,
): PromoCampaignDefinition {
  return {
    id: env.SPARK_PROMO_CAMPAIGN_ID?.trim() || DEFAULT_CAMPAIGN_ID,
    enabled: env.SPARK_PROMO_ENABLED?.trim().toLowerCase() !== "false",
    tokenAmount: parseTokenAmount(env.SPARK_PROMO_TOKEN_AMOUNT),
    startsAt: parseOptionalDate(env.SPARK_PROMO_STARTS_AT),
    endsAt: parseOptionalDate(env.SPARK_PROMO_ENDS_AT),
  };
}

export function isPromoCampaignActive(
  campaign: PromoCampaignDefinition,
  now: Date = new Date(),
): boolean {
  if (!campaign.enabled) return false;
  if (campaign.tokenAmount <= 0) return false;
  const ts = now.getTime();
  if (campaign.startsAt && ts < campaign.startsAt.getTime()) return false;
  if (campaign.endsAt && ts > campaign.endsAt.getTime()) return false;
  return true;
}

/** 当前应对商户展示的活动；无活动返回 null。 */
export function getVisiblePromoCampaign(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): PromoCampaignDefinition | null {
  const campaign = resolvePromoCampaignConfig(env);
  return isPromoCampaignActive(campaign, now) ? campaign : null;
}

export async function hasClaimedPromoCampaign(
  shop: string,
  campaignId: string,
): Promise<boolean> {
  if (await hasPromoClaimLedgerEntry(shop, campaignId)) return true;

  // 兼容：账本落地前已用 BillingLog 领取过的店
  const prior = await prisma.billingLog.findFirst({
    where: {
      shop,
      eventType: BILLING_LOG_EVENT.PROMO_TOKEN_CLAIMED,
      referenceId: campaignId,
    },
    select: { id: true },
  });
  return Boolean(prior);
}

export async function loadPromoCampaignSnapshot(
  shop: string,
): Promise<PromoCampaignSnapshot | null> {
  const campaign = getVisiblePromoCampaign();
  if (!campaign) return null;
  const claimed = await hasClaimedPromoCampaign(shop, campaign.id);
  return {
    campaignId: campaign.id,
    tokenAmount: campaign.tokenAmount,
    claimed,
  };
}

export type ClaimPromoTokensResult = {
  campaignId: string;
  tokensDelta: number;
  alreadyClaimed: boolean;
};

/**
 * 领取当前活动 Token：
 * 1) PromoClaimLedger（shopHash，卸载后仍防薅）
 * 2) Account.purchasedTokens + BillingLog（店内审计，卸载时会清）
 */
export async function claimPromoTokens(shop: string): Promise<ClaimPromoTokensResult> {
  const campaign = getVisiblePromoCampaign();
  if (!campaign) {
    throw new BillingError("当前没有可领取的活动", "PROMO_NOT_AVAILABLE", 400);
  }

  if (await hasClaimedPromoCampaign(shop, campaign.id)) {
    // 旧 BillingLog 有记录但账本缺失时补写账本
    await recordPromoClaimLedger({
      shop,
      campaignId: campaign.id,
      tokensDelta: campaign.tokenAmount,
    }).catch(() => undefined);
    return {
      campaignId: campaign.id,
      tokensDelta: 0,
      alreadyClaimed: true,
    };
  }

  await ensureAccount(shop);

  const ledger = await recordPromoClaimLedger({
    shop,
    campaignId: campaign.id,
    tokensDelta: campaign.tokenAmount,
  });
  if (ledger.alreadyClaimed) {
    return {
      campaignId: campaign.id,
      tokensDelta: 0,
      alreadyClaimed: true,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { shop },
        data: {
          purchasedTokens: { increment: campaign.tokenAmount },
        },
      });

      await tx.billingLog.create({
        data: {
          shop,
          eventType: BILLING_LOG_EVENT.PROMO_TOKEN_CLAIMED,
          referenceId: campaign.id,
          tokensDelta: campaign.tokenAmount,
          metadata: {
            source: "promo_campaign",
            campaignId: campaign.id,
            autoClaimed: true,
          },
        },
      });
    });
  } catch (error) {
    console.error(
      `[Promo] claim account/billing write failed shop=${shop} campaign=${campaign.id}`,
      error,
    );
    throw error;
  }

  return {
    campaignId: campaign.id,
    tokensDelta: campaign.tokenAmount,
    alreadyClaimed: false,
  };
}

/**
 * 安装/进壳后自动领取当前活动 Token（幂等）。无活动或失败时返回 null，不抛给调用方。
 */
export async function ensureInstallPromoTokens(
  shop: string,
): Promise<ClaimPromoTokensResult | null> {
  const campaign = getVisiblePromoCampaign();
  if (!campaign) return null;

  try {
    return await claimPromoTokens(shop);
  } catch (error) {
    console.warn(`[Promo] ensureInstallPromoTokens failed shop=${shop}:`, error);
    return null;
  }
}
