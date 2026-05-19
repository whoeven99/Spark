import { useMemo, useState, type CSSProperties } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { PlanRecord } from "../../lib/billingPageTypes";
import type { loader, action } from "../app.billing";
import {
  computeAnnualDiscountPercent,
  formatAnnualMonthlyEquivalent,
  formatPlanPrice,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  pickSubscriptionPlan,
  resolveCurrentPlanLabel,
  type BillingIntervalView,
  type PlanTier,
} from "../../lib/billingPlanUi";
import styles from "../component/billing/billingPage.module.css";
import { pageContentStyle } from "./pageUiStyles";

const EMPTY = "-";

function compareColumnClass(
  column: "free" | "base" | "pro",
  recommendedTier: PlanTier,
): string {
  if (column === recommendedTier) return styles.compareColHighlight;
  return "";
}

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
  const monthlyEquivalent =
    interval === "ANNUAL" ? formatAnnualMonthlyEquivalent(plan, locale) : null;

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
      <div className={styles.planCardBody}>
        <h3 className={styles.planName}>{plan.displayName}</h3>
        <div className={styles.planPriceRow}>
          <span className={styles.planPrice}>
            {interval === "ANNUAL" && monthlyEquivalent
              ? monthlyEquivalent
              : formatPlanPrice(plan.priceAmount, plan.currencyCode, locale)}
          </span>
          <span className={styles.planPriceSuffix}>
            {interval === "ANNUAL" && monthlyEquivalent
              ? t("billing.perMonth")
              : priceSuffix}
          </span>
        </div>
        {interval === "ANNUAL" ? (
          <p className={styles.planPriceMeta}>
            {t("billing.billedAnnually", {
              amount: formatPlanPrice(plan.priceAmount, plan.currencyCode, locale),
            })}
          </p>
        ) : null}
        <PlanFeatureList items={paidFeatures(plan)} />
      </div>
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

  const tokenCapacity = billing.usedTokens + billing.availableTokens;
  const usagePercent =
    tokenCapacity > 0
      ? Math.min(100, Math.round((billing.usedTokens / tokenCapacity) * 100))
      : 0;
  const recommendedTier: PlanTier = interval === "MONTHLY" ? "base" : "pro";
  const usageLow = usagePercent >= 85;

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
        {!billing.hasAccess && billing.billingRequired ? (
          <s-banner tone="warning">{t("billing.lowBalanceWarning")}</s-banner>
        ) : null}

        <section className={styles.quotaSection}>
          <div className={styles.usageHeader}>
            <div className={styles.usageHeaderMain}>
              <h2 className={styles.usageTitle}>{t("billing.quotaTitle")}</h2>
              <p className={styles.quotaSubtitle}>{t("billing.quotaSubtitle")}</p>
            </div>
            <span className={styles.planBadge}>{currentPlanLabel}</span>
          </div>
          <div className={styles.usageCard}>
            <div className={styles.usageMain}>
              <div className={styles.usageStatsRow}>
                <p
                  className={styles.quotaRatio}
                  aria-label={t("billing.quotaUsageAria", {
                    used: billing.usedTokens.toLocaleString(),
                    available: billing.availableTokens.toLocaleString(),
                  })}
                >
                  <span className={styles.quotaRatioLabel}>
                    {t("billing.usedTokens")} / {t("billing.availableTokens")}
                  </span>
                  <span className={styles.quotaRatioValue}>
                    {billing.usedTokens.toLocaleString()}
                    <span className={styles.quotaRatioSep}> / </span>
                    {billing.availableTokens.toLocaleString()}
                  </span>
                  <span className={styles.quotaRatioUnit}>{t("billing.tokenUnit")}</span>
                </p>
                <span
                  className={`${styles.usagePercentBadge} ${usageLow ? styles.usagePercentBadgeLow : ""}`}
                >
                  {t("billing.usagePercentUsed", { percent: usagePercent })}
                </span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usagePercent}
                aria-label={t("billing.quotaProgressAria", { percent: usagePercent })}
              >
                <div
                  className={`${styles.progressFill} ${usageLow ? styles.progressFillLow : ""}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <div className={styles.poolChips} aria-label={t("billing.sectionUsage")}>
                <div className={styles.poolChip}>
                  <span className={styles.poolChipLabel}>{t("billing.poolSubscription")}</span>
                  <span className={styles.poolChipValue}>
                    {billing.account.subscriptionTokens.toLocaleString()}
                  </span>
                </div>
                <div className={styles.poolChip}>
                  <span className={styles.poolChipLabel}>{t("billing.poolPurchased")}</span>
                  <span className={styles.poolChipValue}>
                    {billing.account.purchasedTokens.toLocaleString()}
                  </span>
                </div>
                <div className={styles.poolChip}>
                  <span className={styles.poolChipLabel}>{t("billing.poolTrial")}</span>
                  <span className={styles.poolChipValue}>
                    {billing.account.trialTokens.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className={styles.quotaFootnote}>{t("billing.planBenefitsFootnote")}</p>
            </div>
          </div>
          {sub?.status === "ACTIVE" || showDevCancelSubscription ? (
            <div className={styles.quotaFooter}>
              {sub?.status === "ACTIVE" ? (
                <p className={styles.subscriptionMeta}>
                  {t("billing.periodEnd")}: {formatDate(sub.currentPeriodEnd, locale)}
                  {sub.trialEndsAt
                    ? ` \u00b7 ${t("billing.trialEnds")}: ${formatDate(sub.trialEndsAt, locale)}`
                    : null}
                </p>
              ) : (
                <span className={styles.quotaFooterSpacer} aria-hidden />
              )}
              {showDevCancelSubscription ? (
                <div className={styles.devCancelBar}>
                  <span className={styles.devCancelBadge}>{t("billing.devEnvBadge")}</span>
                  <p className={styles.devCancelHint}>{t("billing.devCancelHint")}</p>
                  <Form method="post" className={styles.devCancelForm}>
                    <input type="hidden" name="intent" value="cancel_subscription" />
                    <button
                      type="submit"
                      className={styles.devCancelButton}
                      disabled={isCancelling}
                    >
                      {isCancelling
                        ? t("billing.cancelSubscriptionPending")
                        : t("billing.cancelSubscription")}
                    </button>
                  </Form>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {subscriptionPlans.length > 0 ? (
          <section className={styles.plansSection}>
            <div className={styles.plansSectionHead}>
              <div className={styles.plansSectionHeadMain}>
                <h2 className={styles.plansTitle}>{t("billing.choosePlanTitle")}</h2>
                <p className={styles.plansSubtitle}>{t("billing.choosePlanSubtitle")}</p>
              </div>
              {hasIntervalToggle ? (
                <div
                  className={styles.intervalSegmented}
                  role="group"
                  aria-label={t("billing.toggleAnnual")}
                >
                  <button
                    type="button"
                    className={`${styles.intervalOption} ${
                      interval === "MONTHLY" ? styles.intervalOptionActive : ""
                    }`}
                    aria-pressed={interval === "MONTHLY"}
                    onClick={() => setInterval("MONTHLY")}
                  >
                    {t("billing.intervalMonthly")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.intervalOption} ${
                      interval === "ANNUAL" ? styles.intervalOptionActive : ""
                    }`}
                    aria-pressed={interval === "ANNUAL"}
                    onClick={() => setInterval("ANNUAL")}
                  >
                    {t("billing.intervalAnnual")}
                    {headerAnnualDiscount != null ? (
                      <span className={styles.discountPill}>
                        {t("billing.annualDiscountBadge", {
                          percent: headerAnnualDiscount,
                        })}
                      </span>
                    ) : null}
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.planGrid}>
              <article
                className={`${styles.planCard} ${isTrialCurrent ? styles.planCardCurrent : ""}`}
              >
                <div className={styles.planCardBody}>
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
                </div>
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
                <>
                  <p className={styles.packSelectionSummary}>
                    {t("billing.packSelectedSummary", {
                      tokens: selectedPack.tokens.toLocaleString(),
                      price: formatPlanPrice(
                        selectedPack.priceAmount,
                        selectedPack.currencyCode,
                        locale,
                      ),
                    })}
                  </p>
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
                </>
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
                  <th className={compareColumnClass("base", recommendedTier)}>
                    {basePlan.displayName}
                  </th>
                  <th className={compareColumnClass("pro", recommendedTier)}>
                    {proPlan.displayName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.free}</td>
                    <td className={compareColumnClass("base", recommendedTier)}>
                      {row.base}
                    </td>
                    <td className={compareColumnClass("pro", recommendedTier)}>
                      {row.pro}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <p className={styles.trustCheckout}>{t("billing.trustCheckout")}</p>
      </div>
    </s-page>
  );
}
