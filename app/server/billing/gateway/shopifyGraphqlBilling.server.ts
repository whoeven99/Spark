import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/tool";
import { BillingError, BILLING_ERROR_CODE } from "../errors.server";
import { isBillingTestMode } from "../constants.server";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: { message: string }[];
};

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
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      test: $test
      trialDays: $trialDays
    ) {
      appSubscription {
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
      }
    }
  }
`;

export type ShopifyAppSubscriptionNode = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  currentPeriodEnd: string | null;
  trialDays: number;
  test: boolean;
};

export async function shopifyCreateSubscription(
  admin: ShopifyAdminGraphqlClient,
  params: {
    planName: string;
    priceAmount: string;
    currencyCode: string;
    billingInterval: string | null;
    returnUrl: string;
    trialDays?: number | null;
  },
): Promise<{ confirmationUrl: string | null; subscriptionId: string }> {
  const interval = shopifySubscriptionInterval(params.billingInterval);
  const data = await runGraphql<{
    appSubscriptionCreate: {
      appSubscription: { id: string; status: string } | null;
      confirmationUrl: string | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(admin, APP_SUBSCRIPTION_CREATE, {
    name: params.planName,
    returnUrl: params.returnUrl,
    test: isBillingTestMode(),
    trialDays: params.trialDays ?? undefined,
    lineItems: [
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
    ],
  });

  const payload = data.appSubscriptionCreate;
  if (payload.userErrors?.length) {
    throw new BillingError(
      payload.userErrors.map((e) => e.message).join("; "),
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
  };
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
      payload.userErrors.map((e) => e.message).join("; "),
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

export async function shopifyFetchAppSubscription(
  admin: ShopifyAdminGraphqlClient,
  subscriptionId: string,
): Promise<ShopifyAppSubscriptionNode | null> {
  const data = await runGraphql<{
    node: ShopifyAppSubscriptionNode | null;
  }>(admin, APP_SUBSCRIPTION_NODE_QUERY, { id: subscriptionId });

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
  if (normalized === "DECLINED") return "CANCELLED";
  return normalized;
}
