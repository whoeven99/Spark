import { Form, useActionData, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { loader, action } from "../app.billing";

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function subscriptionStatusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PENDING":
      return "info";
    case "FROZEN":
      return "warning";
    case "CANCELLED":
    case "EXPIRED":
      return "critical";
    default:
      return "info";
  }
}

export function BillingPage() {
  const { billing, subscriptionPlans, tokenPacks } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (actionData?.ok && actionData.confirmationUrl) {
    if (typeof window !== "undefined") {
      window.open(actionData.confirmationUrl, "_top");
    }
  } else if (actionData && !actionData.ok) {
    shopify.toast.show(actionData.error);
  }

  const sub = billing.subscription;
  const statusKey = sub
    ? (`billing.status.${sub.status}` as const)
    : null;
  const statusLabel =
    statusKey && i18n.exists(statusKey)
      ? t(statusKey)
      : sub?.status ?? "";

  return (
    <s-page heading={t("billing.pageTitle")}>
      {!billing.hasAccess && billing.billingRequired ? (
        <s-banner tone="warning">{t("billing.lowBalanceWarning")}</s-banner>
      ) : null}

      <s-section heading={t("billing.sectionUsage")}>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="large">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text color="subdued">{t("billing.availableTokens")}</s-text>
                <s-text>
                  <strong>{billing.availableTokens.toLocaleString()}</strong>
                </s-text>
              </s-stack>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text color="subdued">{t("billing.usedTokens")}</s-text>
                <s-text>
                  <strong>{billing.usedTokens.toLocaleString()}</strong>
                </s-text>
              </s-stack>
            </s-box>
          </s-stack>
          <s-text>
            {t("billing.poolSubscription")}:{" "}
            {billing.account.subscriptionTokens.toLocaleString()} ·{" "}
            {t("billing.poolPurchased")}:{" "}
            {billing.account.purchasedTokens.toLocaleString()} ·{" "}
            {t("billing.poolTrial")}:{" "}
            {billing.account.trialTokens.toLocaleString()}
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading={t("billing.sectionSubscription")}>
        {sub ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-badge tone={subscriptionStatusTone(sub.status)}>
                {statusLabel}
              </s-badge>
              <s-text>
                <strong>{sub.planKey}</strong>
                {" · "}
                {sub.billingInterval === "ANNUAL"
                  ? t("billing.intervalAnnual")
                  : t("billing.intervalMonthly")}
                {" · "}
                {sub.tokensPerPeriod.toLocaleString()} tokens
              </s-text>
              <s-text color="subdued">
                {t("billing.periodEnd")}:{" "}
                {formatDate(sub.currentPeriodEnd, locale)}
              </s-text>
              {sub.trialEndsAt ? (
                <s-text color="subdued">
                  {t("billing.trialEnds")}:{" "}
                  {formatDate(sub.trialEndsAt, locale)}
                </s-text>
              ) : null}
            </s-stack>
          </s-box>
        ) : (
          <s-text>{t("billing.noSubscription")}</s-text>
        )}
      </s-section>

      {subscriptionPlans.length > 0 ? (
        <s-section heading={t("billing.sectionPlans")}>
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
                    <strong>{plan.displayName}</strong>
                  </s-text>
                  <s-text color="subdued">
                    {plan.tokens.toLocaleString()} tokens /{" "}
                    {plan.billingInterval === "ANNUAL"
                      ? t("billing.intervalAnnual")
                      : t("billing.intervalMonthly")}
                    {" · "}${plan.priceAmount} {plan.currencyCode}
                    {plan.trialDays
                      ? ` · ${t("billing.trialDays", { count: plan.trialDays })}`
                      : null}
                  </s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="planKey" value={plan.planKey} />
                    <s-button type="submit" variant="primary">
                      {t("billing.subscribe")}
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      ) : null}

      {tokenPacks.length > 0 ? (
        <s-section heading={t("billing.sectionPacks")}>
          <s-stack direction="block" gap="base">
            {tokenPacks.map((plan) => (
              <s-box
                key={plan.planKey}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-text>
                    <strong>{plan.displayName}</strong>
                  </s-text>
                  <s-text color="subdued">
                    {plan.tokens.toLocaleString()} tokens · ${plan.priceAmount}{" "}
                    {plan.currencyCode}
                  </s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="buy_pack" />
                    <input type="hidden" name="planKey" value={plan.planKey} />
                    <s-button type="submit">{t("billing.buyPack")}</s-button>
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
