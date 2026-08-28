import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import { BillingError, BILLING_ERROR_CODE } from "../errors.server";
import { isBillingTestMode } from "../constants.server";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: { message: string }[];
};

function toFriendlyShopifyBillingError(raw: string): string {
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("cannot accept") ||
    lower.includes("can't accept") ||
    lower.includes("provided charge") ||
    lower.includes("declined")
  ) {
    return "店铺当前无法接受该订阅费用。若为测试店，请开启 BILLING_TEST=true（测试计费）；若为正式店，请确认店铺可正常支付 Shopify 应用订阅费用。";
  }

  if (lower.includes("returnurl") && lower.includes("255")) {
    return "订阅回跳地址超过 Shopify 限制，请联系管理员检查 SHOPIFY_APP_URL 配置。";
  }

  return message;
}

function joinUserErrors(errors: { message: string }[] | undefined): string {
  if (!errors?.length) return "Shopify Billing 请求失败";
  return errors.map((e) => toFriendlyShopifyBillingError(e.message)).join("; ");
}

async function runGraphql<T>(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as GraphqlEnvelope<T>;
  if (json.errors?.length) {
    throw new BillingError(
      json.errors.map((e) => e.message).join("; "),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }
  if (!json.data) {
    throw new BillingError(
      "Shopify GraphQL 无 data",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }
  return json.data;
}

function shopifySubscriptionInterval(
  billingInterval: string | null,
): "EVERY_30_DAYS" | "ANNUAL" {
  if (billingInterval === "ANNUAL") return "ANNUAL";
  return "EVERY_30_DAYS";
}

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $test: Boolean
    $trialDays: Int
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      test: $test
      trialDays: $trialDays
      replacementBehavior: $replacementBehavior
    ) {
      appSubscription {
        id
        status
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                  currencyCode
                }
                balanceUsed {
                  amount
                  currencyCode
                }
                terms
              }
            }
          }
        }
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_USAGE_RECORD_CREATE = `#graphql
  mutation AppUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $description: String!
    $price: MoneyInput!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      description: $description
      price: $price
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_SUBSCRIPTION_LINE_ITEM_UPDATE = `#graphql
  mutation AppSubscriptionLineItemUpdate($id: ID!, $cappedAmount: MoneyInput!) {
    appSubscriptionLineItemUpdate(id: $id, cappedAmount: $cappedAmount) {
      confirmationUrl
      appSubscription {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_PURCHASE_ONE_TIME_CREATE = `#graphql
  mutation AppPurchaseOneTimeCreate(
    $name: String!
    $returnUrl: URL!
    $price: MoneyInput!
    $test: Boolean
  ) {
    appPurchaseOneTimeCreate(
      name: $name
      returnUrl: $returnUrl
      price: $price
      test: $test
    ) {
      appPurchaseOneTime {
        id
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_SUBSCRIPTION_NODE_QUERY = `#graphql
  query AppSubscriptionNode($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        name
        status
        createdAt
        currentPeriodEnd
        trialDays
        test
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                  currencyCode
                }
                balanceUsed {
                  amount
                  currencyCode
                }
                terms
              }
            }
          }
        }
      }
    }
  }
`;

const APP_PURCHASE_ONE_TIME_NODE_QUERY = `#graphql
  query AppPurchaseOneTimeNode($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        name
        status
        createdAt
        test
      }
    }
  }
`;

export type ShopifyUsageLineItem = {
  id: string;
  cappedAmount: string;
  cappedCurrency: string;
  balanceUsed: string;
  terms: string | null;
};

export type ShopifyAppSubscriptionNode = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  currentPeriodEnd: string | null;
  trialDays: number;
  test: boolean;
  usageLineItem: ShopifyUsageLineItem | null;
};

type ShopifyLineItemNode = {
  id: string;
  plan?: {
    pricingDetails?: {
      cappedAmount?: { amount: string; currencyCode: string } | null;
      balanceUsed?: { amount: string; currencyCode: string } | null;
      terms?: string | null;
    } | null;
  } | null;
};

function extractUsageLineItem(
  lineItems: ShopifyLineItemNode[] | null | undefined,
): ShopifyUsageLineItem | null {
  if (!lineItems?.length) return null;
  for (const item of lineItems) {
    const details = item.plan?.pricingDetails;
    if (details?.cappedAmount?.amount != null) {
      return {
        id: item.id,
        cappedAmount: String(details.cappedAmount.amount),
        cappedCurrency: details.cappedAmount.currencyCode ?? "USD",
        balanceUsed: details.balanceUsed?.amount
          ? String(details.balanceUsed.amount)
          : "0",
        terms: details.terms ?? null,
      };
    }
  }
  return null;
}

export async function shopifyCreateSubscription(
  admin: ShopifyAdminGraphqlClient,
  params: {
    planName: string;
    priceAmount: string;
    currencyCode: string;
    billingInterval: string | null;
    returnUrl: string;
    trialDays?: number | null;
    overage?: {
      terms: string;
      cappedAmount: string;
      currencyCode: string;
    } | null;
    replacementBehavior?:
      | "APPLY_IMMEDIATELY"
      | "APPLY_ON_NEXT_BILLING_CYCLE"
      | "STANDARD";
  },
): Promise<{
  confirmationUrl: string | null;
  subscriptionId: string;
  usageLineItem: ShopifyUsageLineItem | null;
}> {
  const interval = shopifySubscriptionInterval(params.billingInterval);
  const lineItems: Record<string, unknown>[] = [
    {
      plan: {
        appRecurringPricingDetails: {
          interval,
          price: {
            amount: parseFloat(params.priceAmount),
            currencyCode: params.currencyCode,
          },
        },
      },
    },
  ];

  if (params.overage) {
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          terms: params.overage.terms,
          cappedAmount: {
            amount: parseFloat(params.overage.cappedAmount),
            currencyCode: params.overage.currencyCode,
          },
        },
      },
    });
  }

  const data = await runGraphql<{
    appSubscriptionCreate: {
      appSubscription: {
        id: string;
        status: string;
        lineItems?: ShopifyLineItemNode[] | null;
      } | null;
      confirmationUrl: string | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_SUBSCRIPTION_CREATE, {
    name: params.planName,
    returnUrl: params.returnUrl,
    test: isBillingTestMode(),
    trialDays: params.trialDays ?? undefined,
    lineItems,
    replacementBehavior: params.replacementBehavior,
  });

  const payload = data.appSubscriptionCreate;
  if (payload.userErrors?.length) {
    throw new BillingError(
      joinUserErrors(payload.userErrors),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }
  const sub = payload.appSubscription;
  if (!sub?.id) {
    throw new BillingError(
      "appSubscriptionCreate 未返回订阅 ID",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }

  return {
    confirmationUrl: payload.confirmationUrl,
    subscriptionId: sub.id,
    usageLineItem: extractUsageLineItem(sub.lineItems),
  };
}

export async function shopifyCreateUsageRecord(
  admin: ShopifyAdminGraphqlClient,
  params: {
    subscriptionLineItemId: string;
    description: string;
    amount: number;
    currencyCode: string;
    idempotencyKey: string;
  },
): Promise<{ usageRecordId: string }> {
  const data = await runGraphql<{
    appUsageRecordCreate: {
      appUsageRecord: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_USAGE_RECORD_CREATE, {
    subscriptionLineItemId: params.subscriptionLineItemId,
    description: params.description,
    price: {
      amount: params.amount,
      currencyCode: params.currencyCode,
    },
    idempotencyKey: params.idempotencyKey,
  });

  const payload = data.appUsageRecordCreate;
  if (payload.userErrors?.length) {
    throw new BillingError(
      joinUserErrors(payload.userErrors),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }
  if (!payload.appUsageRecord?.id) {
    throw new BillingError(
      "appUsageRecordCreate 未返回记录 ID",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }
  return { usageRecordId: payload.appUsageRecord.id };
}

export async function shopifyUpdateUsageCappedAmount(
  admin: ShopifyAdminGraphqlClient,
  params: {
    usageLineItemId: string;
    cappedAmount: string;
    currencyCode: string;
  },
): Promise<{ confirmationUrl: string | null }> {
  const data = await runGraphql<{
    appSubscriptionLineItemUpdate: {
      confirmationUrl: string | null;
      appSubscription: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_SUBSCRIPTION_LINE_ITEM_UPDATE, {
    id: params.usageLineItemId,
    cappedAmount: {
      amount: parseFloat(params.cappedAmount),
      currencyCode: params.currencyCode,
    },
  });

  const payload = data.appSubscriptionLineItemUpdate;
  if (payload.userErrors?.length) {
    throw new BillingError(
      joinUserErrors(payload.userErrors),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }
  return { confirmationUrl: payload.confirmationUrl };
}

export async function shopifyCreateOneTimePurchase(
  admin: ShopifyAdminGraphqlClient,
  params: {
    planName: string;
    priceAmount: string;
    currencyCode: string;
    returnUrl: string;
  },
): Promise<{ confirmationUrl: string | null; purchaseId: string }> {
  const data = await runGraphql<{
    appPurchaseOneTimeCreate: {
      appPurchaseOneTime: { id: string; status: string } | null;
      confirmationUrl: string | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_PURCHASE_ONE_TIME_CREATE, {
    name: params.planName,
    returnUrl: params.returnUrl,
    test: isBillingTestMode(),
    price: {
      amount: parseFloat(params.priceAmount),
      currencyCode: params.currencyCode,
    },
  });

  const payload = data.appPurchaseOneTimeCreate;
  if (payload.userErrors?.length) {
    throw new BillingError(
      joinUserErrors(payload.userErrors),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }
  const purchase = payload.appPurchaseOneTime;
  if (!purchase?.id) {
    throw new BillingError(
      "appPurchaseOneTimeCreate 未返回购买 ID",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }

  return {
    confirmationUrl: payload.confirmationUrl,
    purchaseId: purchase.id,
  };
}

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!, $prorate: Boolean) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function shopifyCancelAppSubscription(
  admin: ShopifyAdminGraphqlClient,
  subscriptionId: string,
): Promise<void> {
  const data = await runGraphql<{
    appSubscriptionCancel: {
      appSubscription: { id: string; status: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_SUBSCRIPTION_CANCEL, {
    id: subscriptionId,
    prorate: false,
  });

  const payload = data.appSubscriptionCancel;
  if (payload.userErrors?.length) {
    throw new BillingError(
      joinUserErrors(payload.userErrors),
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }
  if (!payload.appSubscription?.id) {
    throw new BillingError(
      "appSubscriptionCancel 未返回订阅",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }
}

export async function shopifyFetchAppSubscription(
  admin: ShopifyAdminGraphqlClient,
  subscriptionId: string,
): Promise<ShopifyAppSubscriptionNode | null> {
  const data = await runGraphql<{
    node: (Omit<ShopifyAppSubscriptionNode, "usageLineItem"> & {
      lineItems?: ShopifyLineItemNode[] | null;
    }) | null;
  }>(admin, APP_SUBSCRIPTION_NODE_QUERY, { id: subscriptionId });

  if (!data.node) return null;
  const { lineItems, ...rest } = data.node;
  return {
    ...rest,
    usageLineItem: extractUsageLineItem(lineItems),
  };
}

export type ShopifyAppPurchaseOneTimeNode = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  test: boolean;
};

export function toAppPurchaseOneTimeGid(chargeId: string): string {
  const trimmed = chargeId.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  return `gid://shopify/AppPurchaseOneTime/${trimmed}`;
}

export async function shopifyFetchAppPurchaseOneTime(
  admin: ShopifyAdminGraphqlClient,
  purchaseId: string,
): Promise<ShopifyAppPurchaseOneTimeNode | null> {
  const data = await runGraphql<{
    node: ShopifyAppPurchaseOneTimeNode | null;
  }>(admin, APP_PURCHASE_ONE_TIME_NODE_QUERY, {
    id: toAppPurchaseOneTimeGid(purchaseId),
  });

  return data.node;
}

export function periodStartFromCreatedAt(createdAt: string): Date {
  return new Date(createdAt);
}

export function mapShopifySubscriptionStatus(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "PENDING") return "PENDING";
  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "CANCELLED";
  }
  if (normalized === "EXPIRED") return "EXPIRED";
  if (normalized === "FROZEN") return "FROZEN";
  if (normalized === "DECLINED") return "DECLINED";
  return normalized;
}
