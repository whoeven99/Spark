import { useMemo, useState, type CSSProperties } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { PlanRecord } from "../../lib/billingPageTypes";
import type { loader, action } from "../app.billing";
import {
  computeAnnualDiscountPercent,
  formatPlanPrice,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  pickSubscriptionPlan,
  resolveCurrentPlanLabel,
  type BillingIntervalView,
} from "../../lib/billingPlanUi";
import styles from "../component/billing/billingPage.module.css";
import { pageContentStyle, pageIntroBannerStyle } from "./pageUiStyles";

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

function PaidPlanCard({
  plan,
  interval,
  isRecommended,
  isCurrent,
  isPending,
  isSubmitting,
  locale,
  t,
  paidFeatures,
}: {
  plan: PlanRecord;
  interval: BillingIntervalView;
  isRecommended: boolean;
  isCurrent: boolean;
  isPending: boolean;
  isSubmitting: boolean;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  paidFeatures: (plan: PlanRecord) => string[];
}) {
  const priceSuffix =
    interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth");

  return (
    <article
      className={`${styles.planCard} ${
        isRecommended ? styles.planCardRecommended : ""
      } ${isCurrent ? styles.planCardCurrent : ""} ${
        isPending ? styles.planCardPending : ""
      }`}
    >
      {isRecommended ? (
        <span className={styles.recommendedRibbon}>{t("billing.recommended")}</span>
      ) : null}
      <h3 className={styles.planName}>{plan.displayName}</h3>
      <div className={styles.planPriceRow}>
        <span className={styles.planPrice}>
          {formatPlanPrice(plan.priceAmount, plan.currencyCode, locale)}
        </span>
        <span className={styles.planPriceSuffix}>{priceSuffix}</span>
      </div>
      <PlanFeatureList items={paidFeatures(plan)} />
      <PlanSubscribeButton
        plan={plan}
        isCurrent={isCurrent}
        isPending={isPending}
        isSubmitting={isSubmitting}
        label={
          isCurrent
            ? t("billing.currentPlan")
            : isPending
              ? t("billing.pendingConfirmation")
              : isSubmitting
                ? t("billing.redirectingToCheckout")
                : t("billing.getStarted")
        }
      />
    </article>
  );
}

function PlanSubscribeButton({
  plan,
  isCurrent,
  isPending,
  isSubmitting,
  label,
}: {
  plan: PlanRecord;
  isCurrent: boolean;
  isPending: boolean;
  isSubmitting: boolean;
  label: string;
}) {
  if (isCurrent) {
    return (
      <div className={styles.planCurrentCta} role="status" aria-current="true">
        {label}
      </div>
    );
  }
  if (isPending) {
    return (
      <div className={styles.planPendingCta} role="status">
        {label}
      </div>
    );
  }
  return (
    <Form method="post" className={styles.planCta}>
      <input type="hidden" name="intent" value="subscribe" />
      <input type="hidden" name="planKey" value={plan.planKey} />
      <s-button type="submit" variant="primary" disabled={isSubmitting}>
        {label}
      </s-button>
    </Form>
  );
}

export function BillingPage() {
  const { billing, trialPlan, subscriptionPlans, tokenPacks, showDevCancelSubscription } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isCancelling =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "cancel_subscription";
  const subscribingPlanKey =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "subscribe"
      ? String(navigation.formData.get("planKey") ?? "")
      : "";
  const buyingPackKey =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "buy_pack"
      ? String(navigation.formData.get("planKey") ?? "")
      : "";
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const baseMonthly = pickSubscriptionPlan(subscriptionPlans, "MONTHLY", "base");
  const baseAnnual = pickSubscriptionPlan(subscriptionPlans, "ANNUAL", "base");
  const proMonthly = pickSubscriptionPlan(subscriptionPlans, "MONTHLY", "pro");
  const proAnnual = pickSubscriptionPlan(subscriptionPlans, "ANNUAL", "pro");

  const baseAnnualDiscount = useMemo(() => {
    if (!baseMonthly || !baseAnnual) return null;
    return computeAnnualDiscountPercent(baseMonthly, baseAnnual);
  }, [baseMonthly, baseAnnual]);

  const proAnnualDiscount = useMemo(() => {
    if (!proMonthly || !proAnnual) return null;
    return computeAnnualDiscountPercent(proMonthly, proAnnual);
  }, [proMonthly, proAnnual]);

  const headerAnnualDiscount = proAnnualDiscount ?? baseAnnualDiscount;

  const hasIntervalToggle =
    subscriptionPlans.some((p) => p.billingInterval === "MONTHLY") &&
    subscriptionPlans.some((p) => p.billingInterval === "ANNUAL");

  const [interval, setInterval] = useState<BillingIntervalView>(
    billing.subscription?.billingInterval === "ANNUAL" ? "ANNUAL" : "MONTHLY",
  );
  const [selectedPackKey, setSelectedPackKey] = useState(
    () => tokenPacks[0]?.planKey ?? "",
  );

  const basePlan = pickSubscriptionPlan(subscriptionPlans, interval, "base");
  const proPlan = pickSubscriptionPlan(subscriptionPlans, interval, "pro");
  const sub = billing.subscription;

  const isTrialCurrent =
    sub?.status !== "ACTIVE" &&
    sub?.status !== "PENDING" &&
    billing.account.trialTokens > 0;

  const currentPlanLabel = resolveCurrentPlanLabel({
    subscription: sub,
    trialPlan,
    subscriptionPlans,
    account: billing.account,
    t,
  });

  if (actionData?.ok && "noopCheckout" in actionData && actionData.noopCheckout) {
    shopify.toast.show(t("billing.checkoutCompleteNoRedirect"));
  } else if (actionData?.ok && "cancelled" in actionData && actionData.cancelled) {
    shopify.toast.show(t("billing.cancelSubscriptionSuccess"));
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

  const periodSuffix =
    interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth");

  const formatPlanPriceWithPeriod = (plan: PlanRecord) =>
    `${formatPlanPrice(plan.priceAmount, plan.currencyCode, locale)}${periodSuffix}`;

  const compareRows: {
    label: string;
    free: string;
    base: string;
    pro: string;
  }[] = [
    {
      label:
        interval === "MONTHLY"
          ? t("billing.compareMonthlyPrice")
          : t("billing.compareAnnualPrice"),
      free: formatPlanPrice("0", trialPlan?.currencyCode ?? "USD", locale),
      base: basePlan ? formatPlanPriceWithPeriod(basePlan) : EMPTY,
      pro: proPlan ? formatPlanPriceWithPeriod(proPlan) : EMPTY,
    },
    {
      label: t("billing.compareAnnualDiscount"),
      free: EMPTY,
      base:
        baseAnnualDiscount != null
          ? t("billing.discountPercent", { percent: baseAnnualDiscount })
          : EMPTY,
      pro:
        proAnnualDiscount != null
          ? t("billing.discountPercent", { percent: proAnnualDiscount })
          : EMPTY,
    },
    {
      label: t("billing.compareTokens"),
      free: trialPlan?.tokens.toLocaleString() ?? EMPTY,
      base: basePlan?.tokens.toLocaleString() ?? EMPTY,
      pro: proPlan?.tokens.toLocaleString() ?? EMPTY,
    },
    {
      label: t("billing.compareTrialDays"),
      free: EMPTY,
      base: basePlan?.trialDays?.toString() ?? EMPTY,
      pro: proPlan?.trialDays?.toString() ?? EMPTY,
    },
  ];

  const selectedPack =
    tokenPacks.find((p) => p.planKey === selectedPackKey) ?? tokenPacks[0];

  return (
    <s-page heading={t("billing.pageTitle")}>
      <div style={pageContentStyle}>
        <div style={pageIntroBannerStyle("billing", { marginBottom: "1.25rem" })}>
          {t("billing.pageIntro")}
        </div>
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
          {sub?.status === "ACTIVE" ? (
            <p className={styles.subscriptionMeta}>
              {t("billing.periodEnd")}: {formatDate(sub.currentPeriodEnd, locale)}
              {sub.trialEndsAt
                ? ` \u00b7 ${t("billing.trialEnds")}: ${formatDate(sub.trialEndsAt, locale)}`
                : null}
            </p>
          ) : null}
          {showDevCancelSubscription ? (
            <Form method="post" className={styles.devCancelForm}>
              <input type="hidden" name="intent" value="cancel_subscription" />
              <s-button type="submit" tone="critical" disabled={isCancelling}>
                {isCancelling
                  ? t("billing.cancelSubscriptionPending")
                  : t("billing.cancelSubscription")}
              </s-button>
            </Form>
          ) : null}
        </section>

        {subscriptionPlans.length > 0 ? (
          <section>
            <div className={styles.plansSectionHead}>
              <h2 className={styles.plansTitle}>{t("billing.choosePlanTitle")}</h2>
              {hasIntervalToggle ? (
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
                  {headerAnnualDiscount != null ? (
                    <span className={styles.discountPill}>
                      {t("billing.annualDiscountBadge", {
                        percent: headerAnnualDiscount,
                      })}
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
                {isTrialCurrent ? (
                  <div className={styles.planCurrentCta} role="status" aria-current="true">
                    {t("billing.currentPlan")}
                  </div>
                ) : (
                  <div className={styles.planMutedCta}>{t("billing.planFree")}</div>
                )}
              </article>

              {basePlan ? (
                <PaidPlanCard
                  plan={basePlan}
                  interval={interval}
                  isRecommended={interval === "MONTHLY"}
                  isCurrent={isActiveSubscriptionPlan(basePlan.planKey, sub)}
                  isPending={isPendingSubscriptionPlan(basePlan.planKey, sub)}
                  isSubmitting={subscribingPlanKey === basePlan.planKey}
                  locale={locale}
                  t={t}
                  paidFeatures={paidFeatures}
                />
              ) : null}

              {proPlan ? (
                <PaidPlanCard
                  plan={proPlan}
                  interval={interval}
                  isRecommended={interval === "ANNUAL"}
                  isCurrent={isActiveSubscriptionPlan(proPlan.planKey, sub)}
                  isPending={isPendingSubscriptionPlan(proPlan.planKey, sub)}
                  isSubmitting={subscribingPlanKey === proPlan.planKey}
                  locale={locale}
                  t={t}
                  paidFeatures={paidFeatures}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {tokenPacks.length > 0 ? (
          <section className={styles.packSection}>
            <div className={styles.packCard}>
              <div className={styles.packCardHeader}>
                <h2 className={styles.packTitle}>{t("billing.sectionPacks")}</h2>
                <p className={styles.packHint}>{t("billing.sectionPacksHint")}</p>
              </div>
              <div
                className={styles.packOptions}
                style={
                  {
                    ["--pack-columns" as string]: String(
                      Math.min(tokenPacks.length, 4),
                    ),
                  } as CSSProperties
                }
                role="radiogroup"
                aria-label={t("billing.sectionPacks")}
              >
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
                      <span className={styles.packOptionTokens}>
                        {pack.tokens.toLocaleString()}
                      </span>
                      <span className={styles.packOptionTokensUnit}>
                        {t("billing.tokenUnit")}
                      </span>
                      <span className={styles.packOptionPrice}>
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
                <Form method="post" className={styles.packCta}>
                  <input type="hidden" name="intent" value="buy_pack" />
                  <input type="hidden" name="planKey" value={selectedPack.planKey} />
                  <s-button
                    type="submit"
                    variant="primary"
                    disabled={Boolean(buyingPackKey)}
                  >
                    {buyingPackKey
                      ? t("billing.redirectingToCheckout")
                      : t("billing.purchaseCredits")}
                  </s-button>
                </Form>
              ) : null}
            </div>
          </section>
        ) : null}

        {basePlan && proPlan ? (
          <section className={styles.compareSection}>
            <h2 className={styles.compareTitle}>{t("billing.compareTitle")}</h2>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>{t("billing.compareFeatureCol")}</th>
                  <th>{trialPlan?.displayName ?? t("billing.planFree")}</th>
                  <th>{basePlan.displayName}</th>
                  <th>{proPlan.displayName}</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.free}</td>
                    <td>{row.base}</td>
                    <td>{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </s-page>
  );
}
