/** 与 `planCatalog.server` 的 PlanRecord 一致，供客户端组件使用。 */
export type PlanRecord = {
  planKey: string;
  kind: string;
  billingInterval: string | null;
  displayName: string;
  tokens: number;
  priceAmount: string;
  currencyCode: string;
  trialDays: number | null;
  shopifyPlanName: string | null;
  overagePricePerThousand: string | null;
  defaultOverageCapAmount: string | null;
  overageTerms: string | null;
};

export type BillingOverageSnapshot = {
  enabled: boolean;
  cappedAmount: string | null;
  cappedCurrency: string | null;
  usageBalanceUsed: string | null;
  pricePerThousand: string | null;
  pendingTokens: number;
  capRemainingUsd: number;
  estimatedTokensLeft: number;
  approaching: boolean;
  capReached: boolean;
};

/** 计费页 loader 可序列化快照（避免 Prisma Date 等类型）。 */
export type BillingPageSnapshot = {
  shop: string;
  billingRequired: boolean;
  hasAccess: boolean;
  availableTokens: number;
  usedTokens: number;
  denialReason: "none" | "quota_exhausted" | "overage_cap_reached";
  overage: BillingOverageSnapshot | null;
  account: {
    subscriptionTokens: number;
    purchasedTokens: number;
    trialTokens: number;
  };
  subscription: {
    planKey: string;
    status: string;
    billingInterval: string;
    tokensPerPeriod: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    overageEnabled: boolean;
  } | null;
};

export type PendingPlanChangeSnapshot = {
  planKey: string;
  planName: string;
  confirmationUrl: string | null;
  createdAt: string | null;
};

export type BillingReturnFlash =
  | "awaiting_shopify_confirm"
  | "plan_unchanged_declined"
  | null;

export type BillingHistoryItem = {
  id: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  tokensDelta: number | null;
  usedTokens: number | null;
  createdAt: string;
};

export type BillingOverageChargeItem = {
  id: string;
  tokens: number;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
};

export type BillingUsagePeriodItem = {
  id: string;
  planKey: string;
  periodStart: string;
  periodEnd: string;
  usedTokens: number;
  subscriptionTokensAllocated: number;
  purchasedTokensRemaining: number;
  trialTokensRemaining: number;
  archivedAt: string;
};

export type BillingToolUsageItem = {
  id: string;
  feature: string;
  modelKey: string;
  rawTokens: number;
  billedTokens: number;
  createdAt: string;
};

export type BillingPageLoaderData = {
  billing: BillingPageSnapshot;
  trialPlan: PlanRecord | null;
  subscriptionPlans: PlanRecord[];
  tokenPacks: PlanRecord[];
  usageHistory: BillingUsagePeriodItem[];
  billingHistory: BillingHistoryItem[];
  toolUsageHistory: BillingToolUsageItem[];
  overageCharges: BillingOverageChargeItem[];
  /** NODE_ENV=test 且存在可取消订阅时为 true */
  showDevCancelSubscription: boolean;
  /** 换套餐待 Shopify 确认 */
  pendingPlanChange: PendingPlanChangeSnapshot | null;
  /** 从 Shopify 结账回跳时的一次性提示 */
  billingReturnFlash: BillingReturnFlash;
};

/** 其它页面仅需展示访问状态时使用。 */
export type BillingAccessSnapshot = Pick<
  BillingPageSnapshot,
  "billingRequired" | "hasAccess"
>;
