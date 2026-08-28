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

export type CreateUsageRecordResult = {
  usageRecordId: string | null;
};

export type UpdateOverageCapResult = {
  confirmationUrl: string | null;
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

  createUsageRecord?(params: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    subscriptionLineItemId: string;
    description: string;
    amount: number;
    currencyCode: string;
    idempotencyKey: string;
  }): Promise<CreateUsageRecordResult>;

  updateOverageCap?(params: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    usageLineItemId: string;
    cappedAmount: string;
    currencyCode: string;
  }): Promise<UpdateOverageCapResult>;
}
