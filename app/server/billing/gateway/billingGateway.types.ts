import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { PlanRecord } from "../plans/planCatalog.server";

export type CreateSubscriptionResult = {
  confirmationUrl: string | null;
  shopifySubscriptionId: string;
};

export type CreateOneTimePurchaseResult = {
  confirmationUrl: string | null;
  shopifyPurchaseId: string;
};

export interface BillingGateway {
  createSubscription(params: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    plan: PlanRecord;
    returnUrl: string;
    trialDays?: number | null;
  }): Promise<CreateSubscriptionResult>;

  createOneTimePurchase(params: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    plan: PlanRecord;
    returnUrl: string;
  }): Promise<CreateOneTimePurchaseResult>;
}
