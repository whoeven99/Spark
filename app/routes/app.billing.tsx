import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAppEntry } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";
import {
  BillingError,
  loadBillingContext,
  startSubscriptionCheckout,
  startTokenPackCheckout,
} from "../server/billing";
import { PLAN_CATALOG_KIND } from "../server/billing/types.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appName = getAppEntry();
  const billing = await loadBillingContext(session.shop, appName);
  return { billing, appName };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const appName = getAppEntry();
  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  const planKey = form.get("planKey")?.toString();

  if (!intent || !planKey) {
    return { ok: false as const, error: "缺少 intent 或 planKey" };
  }

  try {
    if (intent === "subscribe") {
      const { confirmationUrl } = await startSubscriptionCheckout({
        admin,
        shop: session.shop,
        appName,
        planKey,
        request,
      });
      return { ok: true as const, confirmationUrl };
    }
    if (intent === "buy_pack") {
      const { confirmationUrl } = await startTokenPackCheckout({
        admin,
        shop: session.shop,
        appName,
        planKey,
        request,
      });
      return { ok: true as const, confirmationUrl };
    }
    return { ok: false as const, error: "未知操作" };
  } catch (error) {
    const message =
      error instanceof BillingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "计费操作失败";
    return { ok: false as const, error: message };
  }
};

export default function BillingPage() {
  const { billing, appName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();

  if (actionData?.ok && actionData.confirmationUrl) {
    if (typeof window !== "undefined") {
      window.open(actionData.confirmationUrl, "_top");
    }
  } else if (actionData && !actionData.ok) {
    shopify.toast.show(actionData.error);
  }

  const subscriptionPlans = billing.plans.filter(
    (p) => p.kind === PLAN_CATALOG_KIND.SUBSCRIPTION,
  );
  const packs = billing.plans.filter(
    (p) => p.kind === PLAN_CATALOG_KIND.ONE_TIME_PACK,
  );

  return (
    <s-page heading="计费与 Token">
      <s-section heading="当前用量">
        <s-stack direction="block" gap="base">
          <s-text>App：{appName}</s-text>
          <s-text>
            可用 Token：{billing.availableTokens.toLocaleString()}（已用{" "}
            {billing.usedTokens.toLocaleString()}）
          </s-text>
          <s-text>
            订阅池：{billing.account.subscriptionTokens.toLocaleString()} ·
            按量包：{billing.account.purchasedTokens.toLocaleString()} · 试用：
            {billing.account.trialTokens.toLocaleString()}
          </s-text>
          {billing.subscription ? (
            <s-text>
              订阅：{billing.subscription.planKey}（{billing.subscription.status}
              ）
              {billing.subscription.currentPeriodEnd
                ? ` · 周期至 ${new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}`
                : null}
            </s-text>
          ) : (
            <s-text>尚未开通付费订阅</s-text>
          )}
        </s-stack>
      </s-section>

      {subscriptionPlans.length > 0 ? (
        <s-section heading="订阅套餐">
          <s-stack direction="block" gap="base">
            {subscriptionPlans.map((plan) => (
              <s-box
                key={plan.planKey}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-text>
                    <strong>{plan.displayName}</strong> —{" "}
                    {plan.tokens.toLocaleString()} tokens /{" "}
                    {plan.billingInterval === "ANNUAL" ? "年" : "月"} · $
                    {plan.priceAmount} {plan.currencyCode}
                  </s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="planKey" value={plan.planKey} />
                    <s-button type="submit">订阅</s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      ) : null}

      {packs.length > 0 ? (
        <s-section heading="按量购买 Token">
          <s-stack direction="block" gap="base">
            {packs.map((plan) => (
              <s-box
                key={plan.planKey}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-text>
                    <strong>{plan.displayName}</strong> —{" "}
                    {plan.tokens.toLocaleString()} tokens · ${plan.priceAmount}{" "}
                    {plan.currencyCode}
                  </s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="buy_pack" />
                    <input type="hidden" name="planKey" value={plan.planKey} />
                    <s-button type="submit">购买</s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
