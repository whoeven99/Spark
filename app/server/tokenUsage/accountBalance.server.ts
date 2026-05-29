/** Account 行上用于余额计算的字段（与 Prisma `Account` 一致）。 */
export type AccountBalanceFields = {
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  availableTokens?: number;
  usedTokens: number;
};

/** 可用 token（优先用库生成列，否则本地求和）。 */
export function getAvailableTokens(account: AccountBalanceFields): number {
  if (typeof account.availableTokens === "number") {
    return account.availableTokens;
  }
  return (
    account.subscriptionTokens + account.purchasedTokens + account.trialTokens
  );
}

export function hasTokenQuota(account: AccountBalanceFields): boolean {
  return account.usedTokens < getAvailableTokens(account);
}
