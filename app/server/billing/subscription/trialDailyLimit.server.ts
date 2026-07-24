import prisma from "../../../db.server";
import { TrialDailyLimitError } from "../errors.server";

/** 试用期每日限额 = tokensPerPeriod / 30（向上取整）。 */
const TRIAL_DAILY_DIVISOR = 30;

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * 在 Shopify 试用期内，检查并记录每日积分用量。
 *
 * 仅当 subscription.trialEndsAt 存在且未到期时执行限额逻辑；
 * 超限则抛出 TrialDailyLimitError，调用方应将其转为 429 响应。
 */
export async function checkAndIncrementTrialDailyUsage(params: {
  shop: string;
  billedTokens: number;
}): Promise<void> {
  const { shop, billedTokens } = params;
  if (billedTokens <= 0) return;

  const [account, subscription] = await Promise.all([
    prisma.account.findUnique({ where: { shop } }),
    prisma.appSubscription.findUnique({ where: { shop } }),
  ]);

  if (!account || !subscription) return;

  const now = new Date();
  const isInShopifyTrial =
    subscription.trialEndsAt != null && now < subscription.trialEndsAt;

  if (!isInShopifyTrial) return;

  const dailyLimit = Math.ceil(subscription.tokensPerPeriod / TRIAL_DAILY_DIVISOR);
  const todayStart = startOfDayUTC(now);

  const needsReset =
    !account.trialDailyResetAt || account.trialDailyResetAt < todayStart;

  const currentDailyUsed = needsReset ? 0 : account.trialDailyUsed;

  if (currentDailyUsed + billedTokens > dailyLimit) {
    throw new TrialDailyLimitError(dailyLimit, currentDailyUsed);
  }

  await prisma.account.update({
    where: { shop },
    data: {
      trialDailyUsed: needsReset ? billedTokens : { increment: billedTokens },
      ...(needsReset ? { trialDailyResetAt: todayStart } : {}),
    },
  });
}
