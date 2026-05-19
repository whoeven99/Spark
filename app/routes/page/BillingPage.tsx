import { useMemo, useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { PlanRecord } from "../../lib/billingPageTypes";
import type { loader, action } from "../app.billing";
import {
  computeAnnualDiscountPercent,
  formatPlanPrice,
  isActiveSubscriptionPlan,
  pickSubscriptionByInterval,
  resolveCurrentPlanLabel,
  type BillingIntervalView,
} from "../../lib/billingPlanUi";
import styles from "../component/billing/billingPage.module.css";

const EMPTY = "-";

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return EMPTY;
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function PlanFeatureList({ items }: { items: string[] }) {
  return (
    <ul className={styles.planFeatures}>
      {items.map((text) => (
        <li key={text} className={styles.planFeature}>
          <span className={styles.checkIcon} aria-hidden>
            {"\u2713"}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanSubscribeButton({
  plan,
  isCurrent,
  label,
}: {
  plan: PlanRecord;
  isCurrent: boolean;
  label: string;
}) {
  if (isCurrent) {
    return (
      <s-button disabled className={styles.planCta}>
        {label}
      </s-button>
    );
  }
  return (
    <Form method="post" className={styles.planCta}>
      <input type="hidden" name="intent" value="subscribe" />
      <input type="hidden" name="planKey" value={plan.planKey} />
      <s-button type="submit" variant="primary">
        {label}
      </s-button>
    </Form>
  );
}

export function BillingPage() {
  const { billing, trialPlan, subscriptionPlans, tokenPacks } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const monthlyPlan = pickSubscriptionByInterval(subscriptionPlans, "MONTHLY");
  const annualPlan = pickSubscriptionByInterval(subscriptionPlans, "ANNUAL");
  const annualDiscount = useMemo(() => {
    if (!monthlyPlan || !annualPlan) return null;
    return computeAnnualDiscountPercent(monthlyPlan, annualPlan);
  }, [monthlyPlan, annualPlan]);

  const [interval, setInterval] = useState<BillingIntervalView>(
    billing.subscription?.billingInterval === "ANNUAL" ? "ANNUAL" : "MONTHLY",
  );
  const [selectedPackKey, setSelectedPackKey] = useState(
    () => tokenPacks[0]?.planKey ?? "",
  );

  const highlightedPlan = pickSubscriptionByInterval(subscriptionPlans, interval);
  const sub = billing.subscription;

  const isOnPaidPlan =
    !!sub && (sub.status === "ACTIVE" || sub.status === "PENDING");
  const isTrialCurrent = !isOnPaidPlan && billing.account.trialTokens > 0;

  const currentPlanLabel = resolveCurrentPlanLabel({
    subscription: sub,
    trialPlan,
    subscriptionPlans,
    account: billing.account,
    t,
  });

  if (actionData?.ok && actionData.confirmationUrl) {
    if (typeof window !== "undefined") {
      window.open(actionData.confirmationUrl, "_top");
    }
  } else if (actionData && !actionData.ok) {
    shopify.toast.show(actionData.error);
  }

  const trialFeatures = [
    t("billing.featureTrialTokens", {
      count: (trialPlan?.tokens ?? 10000).toLocaleString(),
    }),
    t("billing.featureGenerateDescription"),
    t("billing.featureNoSubscription"),
  ];

  const paidFeatures = (plan: PlanRecord) =>
    [
      t("billing.featureTokensPerPeriod", {
        count: plan.tokens.toLocaleString(),
      }),
      plan.trialDays
        ? t("billing.featureShopifyTrial", { count: plan.trialDays })
        : null,
      t("billing.featureGenerateDescription"),
      t("billing.featurePriority"),
    ].filter((line): line is string => Boolean(line));

  const compareRows: {
    label: string;
    free: string;
    monthly: string;
    annual: string;
  }[] = [
    {
      label: t("billing.compareMonthlyPrice"),
      free: formatPlanPrice("0", trialPlan?.currencyCode ?? "USD", locale),
      monthly: monthlyPlan
        ? `${formatPlanPrice(monthlyPlan.priceAmount, monthlyPlan.currencyCode, locale)}${t("billing.perMonth")}`
        : EMPTY,
      annual: annualPlan
        ? `${formatPlanPrice(annualPlan.priceAmount, annualPlan.currencyCode, locale)}${t("billing.perYear")}`
        : EMPTY,
    },
    {
      label: t("billing.compareAnnualDiscount"),
      free: EMPTY,
      monthly: EMPTY,
      annual:
        annualDiscount != null
          ? t("billing.discountPercent", { percent: annualDiscount })
          : EMPTY,
    },
    {
      label: t("billing.compareTokens"),
      free: trialPlan?.tokens.toLocaleString() ?? EMPTY,
      monthly: monthlyPlan?.tokens.toLocaleString() ?? EMPTY,
      annual: annualPlan?.tokens.toLocaleString() ?? EMPTY,
    },
    {
      label: t("billing.compareTrialDays"),
      free: EMPTY,
      monthly: monthlyPlan?.trialDays?.toString() ?? EMPTY,
      annual: annualPlan?.trialDays?.toString() ?? EMPTY,
    },
  ];

  const selectedPack =
    tokenPacks.find((p) => p.planKey === selectedPackKey) ?? tokenPacks[0];

  return (
    <s-page heading={t("billing.pageTitle")}>
      <div className={styles.page}>
        {!billing.hasAccess && billing.billingRequired ? (
          <s-banner tone="warning">{t("billing.lowBalanceWarning")}</s-banner>
        ) : null}

        <section>
          <div className={styles.usageHeader}>
            <h2 className={styles.usageTitle}>{t("billing.quotaTitle")}</h2>
            <span className={styles.planBadge}>{currentPlanLabel}</span>
          </div>
          <div className={styles.usageCard}>
            <div className={styles.usageBenefits}>
              {t("billing.planBenefits")}
            </div>
            <div className={styles.usageMetrics}>
              <div className={styles.usageMetric}>
                <p className={styles.metricLabel}>{t("billing.availableTokens")}</p>
                <p className={styles.metricValue}>
                  {billing.availableTokens.toLocaleString()}
                </p>
                <p className={styles.metricUnit}>{t("billing.tokenUnit")}</p>
              </div>
              <div className={styles.usageMetric}>
                <p className={styles.metricLabel}>{t("billing.usedTokens")}</p>
                <p className={styles.metricValue}>
                  {billing.usedTokens.toLocaleString()}
                </p>
                <p className={styles.metricUnit}>{t("billing.tokenUnit")}</p>
              </div>
            </div>
            <p className={styles.usagePools}>
              {t("billing.poolSubscription")}:{" "}
              {billing.account.subscriptionTokens.toLocaleString()}
              {" \u00b7 "}
              {t("billing.poolPurchased")}:{" "}
              {billing.account.purchasedTokens.toLocaleString()}
              {" \u00b7 "}
              {t("billing.poolTrial")}:{" "}
              {billing.account.trialTokens.toLocaleString()}
            </p>
          </div>
          {sub && (sub.status === "ACTIVE" || sub.status === "PENDING") ? (
            <p className={styles.subscriptionMeta}>
              {t("billing.periodEnd")}: {formatDate(sub.currentPeriodEnd, locale)}
              {sub.trialEndsAt
                ? ` \u00b7 ${t("billing.trialEnds")}: ${formatDate(sub.trialEndsAt, locale)}`
                : null}
            </p>
          ) : null}
        </section>

        {subscriptionPlans.length > 0 ? (
          <section>
            <div className={styles.plansSectionHead}>
              <h2 className={styles.plansTitle}>{t("billing.choosePlanTitle")}</h2>
              {monthlyPlan && annualPlan ? (
                <div className={styles.intervalToggle}>
                  <span
                    className={
                      interval === "MONTHLY"
                        ? styles.toggleLabelActive
                        : styles.toggleLabel
                    }
                  >
                    {t("billing.intervalMonthly")}
                  </span>
                  <button
                    type="button"
                    className={`${styles.switch} ${interval === "ANNUAL" ? styles.switchOn : ""}`}
                    role="switch"
                    aria-checked={interval === "ANNUAL"}
                    aria-label={t("billing.toggleAnnual")}
                    onClick={() =>
                      setInterval((v) => (v === "MONTHLY" ? "ANNUAL" : "MONTHLY"))
                    }
                  >
                    <span className={styles.switchThumb} />
                  </button>
                  <span
                    className={
                      interval === "ANNUAL"
                        ? styles.toggleLabelActive
                        : styles.toggleLabel
                    }
                  >
                    {t("billing.intervalAnnual")}
                  </span>
                  {annualDiscount != null && interval === "ANNUAL" ? (
                    <span className={styles.discountPill}>
                      {t("billing.annualDiscountBadge", { percent: annualDiscount })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className={styles.planGrid}>
              <article
                className={`${styles.planCard} ${isTrialCurrent ? styles.planCardCurrent : ""}`}
              >
                <h3 className={styles.planName}>
                  {trialPlan?.displayName ?? t("billing.planFree")}
                </h3>
                <div className={styles.planPriceRow}>
                  <span className={styles.planPrice}>
                    {formatPlanPrice("0", trialPlan?.currencyCode ?? "USD", locale)}
                  </span>
                  <span className={styles.planPriceSuffix}>
                    {t("billing.perMonth")}
                  </span>
                </div>
                <PlanFeatureList items={trialFeatures} />
                <s-button disabled className={styles.planCta}>
                  {isTrialCurrent
                    ? t("billing.currentPlan")
                    : t("billing.planFree")}
                </s-button>
              </article>

              {monthlyPlan ? (
                <article
                  className={`${styles.planCard} ${
                    interval === "MONTHLY" &&
                    highlightedPlan?.planKey === monthlyPlan.planKey
                      ? styles.planCardRecommended
                      : ""
                  } ${
                    isActiveSubscriptionPlan(monthlyPlan.planKey, sub)
                      ? styles.planCardCurrent
                      : ""
                  }`}
                >
                  {interval === "MONTHLY" ? (
                    <span className={styles.recommendedRibbon}>
                      {t("billing.recommended")}
                    </span>
                  ) : null}
                  <h3 className={styles.planName}>{monthlyPlan.displayName}</h3>
                  <div className={styles.planPriceRow}>
                    <span className={styles.planPrice}>
                      {formatPlanPrice(
                        monthlyPlan.priceAmount,
                        monthlyPlan.currencyCode,
                        locale,
                      )}
                    </span>
                    <span className={styles.planPriceSuffix}>
                      {t("billing.perMonth")}
                    </span>
                  </div>
                  <PlanFeatureList items={paidFeatures(monthlyPlan)} />
                  <PlanSubscribeButton
                    plan={monthlyPlan}
                    isCurrent={isActiveSubscriptionPlan(monthlyPlan.planKey, sub)}
                    label={
                      isActiveSubscriptionPlan(monthlyPlan.planKey, sub)
                        ? t("billing.currentPlan")
                        : t("billing.getStarted")
                    }
                  />
                </article>
              ) : null}

              {annualPlan ? (
                <article
                  className={`${styles.planCard} ${
                    interval === "ANNUAL" ? styles.planCardRecommended : ""
                  } ${
                    isActiveSubscriptionPlan(annualPlan.planKey, sub)
                      ? styles.planCardCurrent
                      : ""
                  }`}
                >
                  {interval === "ANNUAL" ? (
                    <span className={styles.recommendedRibbon}>
                      {t("billing.recommended")}
                    </span>
                  ) : null}
                  <h3 className={styles.planName}>{annualPlan.displayName}</h3>
                  <div className={styles.planPriceRow}>
                    <span className={styles.planPrice}>
                      {formatPlanPrice(
                        annualPlan.priceAmount,
                        annualPlan.currencyCode,
                        locale,
                      )}
                    </span>
                    <span className={styles.planPriceSuffix}>
                      {t("billing.perYear")}
                    </span>
                  </div>
                  <PlanFeatureList items={paidFeatures(annualPlan)} />
                  <PlanSubscribeButton
                    plan={annualPlan}
                    isCurrent={isActiveSubscriptionPlan(annualPlan.planKey, sub)}
                    label={
                      isActiveSubscriptionPlan(annualPlan.planKey, sub)
                        ? t("billing.currentPlan")
                        : t("billing.getStarted")
                    }
                  />
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {monthlyPlan && annualPlan ? (
          <section className={styles.compareSection}>
            <h2 className={styles.compareTitle}>{t("billing.compareTitle")}</h2>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>{t("billing.compareFeatureCol")}</th>
                  <th>{trialPlan?.displayName ?? t("billing.planFree")}</th>
                  <th>{monthlyPlan.displayName}</th>
                  <th>{annualPlan.displayName}</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.free}</td>
                    <td>{row.monthly}</td>
                    <td>{row.annual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {tokenPacks.length > 0 ? (
          <section>
            <h2 className={styles.plansTitle}>{t("billing.sectionPacks")}</h2>
            <div className={styles.packCard}>
              <div className={styles.packOptions} role="radiogroup">
                {tokenPacks.map((pack) => {
                  const selected = pack.planKey === selectedPack?.planKey;
                  return (
                    <button
                      key={pack.planKey}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`${styles.packOption} ${selected ? styles.packOptionSelected : ""}`}
                      onClick={() => setSelectedPackKey(pack.planKey)}
                    >
                      <span className={styles.packOptionLabel}>
                        {pack.tokens.toLocaleString()} /{" "}
                        {formatPlanPrice(
                          pack.priceAmount,
                          pack.currencyCode,
                          locale,
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPack ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="buy_pack" />
                  <input type="hidden" name="planKey" value={selectedPack.planKey} />
                  <s-button type="submit" variant="primary">
                    {t("billing.purchaseCredits")}
                  </s-button>
                </Form>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </s-page>
  );
}
