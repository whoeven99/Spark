/** Account 行上用于余额计算的字段（与 Prisma `Account` 一致）。 */
export type AccountBalanceFields = {
  subscriptionTokens: number;
  purchasedTokens: number;
  availableTokens?: number;
  usedTokens: number;
};

/** 含内可用 token（订阅池 + 购包；不含超额）。 */
export function getAvailableTokens(account: AccountBalanceFields): number {
  if (typeof account.availableTokens === "number") {
    return account.availableTokens;
  }
  return account.subscriptionTokens + account.purchasedTokens;
}

/** 仅判断含内额度是否还有剩余（不含超额）。 */
export function hasTokenQuota(account: AccountBalanceFields): boolean {
  return account.usedTokens < getAvailableTokens(account);
}

/** 含内已用完后落入超额的 token 数。 */
export function getOverageTokensUsed(account: AccountBalanceFields): number {
  return Math.max(0, account.usedTokens - getAvailableTokens(account));
}
