import type { PlanRecord } from "../server/billing/plans/planCatalog.server";

/** 计费页 loader 可序列化快照（避免 Prisma Date 等类型）。 */
export type BillingPageSnapshot = {
  shop: string;
  appName: string;
  billingRequired: boolean;
  hasAccess: boolean;
  availableTokens: number;
  usedTokens: number;
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
  } | null;
};

export type BillingPageLoaderData = {
  appName: string;
  billing: BillingPageSnapshot;
  subscriptionPlans: PlanRecord[];
  tokenPacks: PlanRecord[];
};

/** 其它页面仅需展示访问状态时使用。 */
export type BillingAccessSnapshot = Pick<
  BillingPageSnapshot,
  "billingRequired" | "hasAccess"
>;
