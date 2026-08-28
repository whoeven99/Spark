import type { AccountBalanceFields } from "./accountBalance.server";

/** 续费结算扣减顺序：订阅周期 → 按量包。 */
export const TOKEN_POOL_DEDUCTION_ORDER = [
  "subscriptionTokens",
  "purchasedTokens",
] as const;

export type TokenPoolBalances = Pick<
  AccountBalanceFields,
  "subscriptionTokens" | "purchasedTokens"
>;

/**
 * 周期内为双池分配额/余额之和与 `usedTokens` 对比；`usedTokens` 不超过该和时可做续费结算。
 */
export function canSettlePoolsAtRenewal(account: AccountBalanceFields): boolean {
  if (account.usedTokens <= 0) return false;
  const poolTotal = account.subscriptionTokens + account.purchasedTokens;
  return account.usedTokens <= poolTotal;
}

/** 续费时按本周期 `usedTokens` 结算双池真实剩余（仅写入续费逻辑，平时不调用）。 */
export function settlePoolsAtRenewal(
  account: AccountBalanceFields,
): TokenPoolBalances {
  return deductTokenUsage(
    {
      subscriptionTokens: account.subscriptionTokens,
      purchasedTokens: account.purchasedTokens,
    },
    account.usedTokens,
  );
}

/** 从各池按顺序扣减 `amount`。 */
export function deductTokenUsage(
  pools: TokenPoolBalances,
  amount: number,
): TokenPoolBalances {
  let remaining = Math.max(0, Math.floor(amount));
  const next: TokenPoolBalances = { ...pools };

  for (const key of TOKEN_POOL_DEDUCTION_ORDER) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, next[key]));
    next[key] -= take;
    remaining -= take;
  }

  return next;
}
