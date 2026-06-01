import { useMemo, useState, type CSSProperties } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  BillingHistoryItem,
  BillingToolUsageItem,
  BillingUsagePeriodItem,
  PlanRecord,
} from "../../lib/billingPageTypes";
import type { loader, action } from "../app.billing";
import {
  computeAnnualDiscountPercent,
  formatAnnualMonthlyEquivalent,
  formatPlanPrice,
  formatTokenUsagePercentDisplay,
  getTokenUsagePercent,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  listSubscriptionPlansForInterval,
  pickSubscriptionPlan,
  planTierFromPlanKey,
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

/** 计费页徽章区：更短的日期，避免一行过长换行 */
function formatBillingMetaDate(iso: string | null, locale: string): string {
  if (!iso) return EMPTY;
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolvePlanDisplayName(planKey: string | null, plans: PlanRecord[]): string {
  if (!planKey) return EMPTY;
  return plans.find((plan) => plan.planKey === planKey)?.displayName ?? planKey;
}

function resolveBillingEventLabel(
  eventType: BillingHistoryItem["eventType"],
  t: (key: string) => string,
): string {
  switch (eventType) {
    case "TRIAL_GRANTED":
      return t("billing.eventTrialGranted");
    case "SUBSCRIPTION_ACTIVATED":
      return t("billing.eventSubscriptionActivated");
    case "SUBSCRIPTION_RENEWED":
      return t("billing.eventSubscriptionRenewed");
    case "SUBSCRIPTION_CANCELLED":
      return t("billing.eventSubscriptionCancelled");
    case "TOKEN_PACK_INITIATED":
      return t("billing.eventTokenPackInitiated");
    case "TOKEN_PACK_PURCHASED":
      return t("billing.eventTokenPackPurchased");
    default:
      return eventType;
  }
}

function resolveBillingEventToneClass(
  eventType: BillingHistoryItem["eventType"],
  stylesMap: Record<string, string>,
): string {
  switch (eventType) {
    case "SUBSCRIPTION_CANCELLED":
      return stylesMap.historyToneWarning;
    case "TOKEN_PACK_INITIATED":
      return stylesMap.historyToneNeutral;
    case "TRIAL_GRANTED":
    case "SUBSCRIPTION_ACTIVATED":
    case "SUBSCRIPTION_RENEWED":
    case "TOKEN_PACK_PURCHASED":
      return stylesMap.historyTonePositive;
    default:
      return stylesMap.historyToneNeutral;
  }
}

function resolveToolUsageFeatureLabel(
  feature: BillingToolUsageItem["feature"],
  t: (key: string) => string,
): string {
  switch (feature) {
    case "product_copy":
      return t("billing.toolFeatureProductCopy");
    case "image_generate":
      return t("billing.toolFeatureImageGenerate");
    case "image_prompt":
      return t("billing.toolFeatureImagePrompt");
    case "picture_translate":
      return t("billing.toolFeaturePictureTranslate");
    default:
      return feature;
  }
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
  const periodSuffix = interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth");
  const monthlyEquivalent =
    interval === "ANNUAL" ? formatAnnualMonthlyEquivalent(plan, locale) : null;

  return (
    <article
      className={`${styles.planCard} ${
        isRecommended ? styles.planCardRecommended : ""
      } ${isCurrent ? styles.planCardCurrent : ""} ${isPending ? styles.planCardPending : ""}`}
    >
      {isRecommended ? (
        <span className={styles.recommendedRibbon}>{t("billing.recommended")}</span>
      ) : null}
      <div className={styles.planCardBody}>
        <h3 className={styles.planName}>{plan.displayName}</h3>
        <div className={styles.planPriceRow}>
          <span className={styles.planPrice}>
            {formatPlanPrice(plan.priceAmount, plan.currencyCode, locale)}
          </span>
          <span className={styles.planPriceSuffix}>{periodSuffix}</span>
        </div>
        {monthlyEquivalent ? (
          <p className={styles.planPriceMeta}>{`${monthlyEquivalent}${t("billing.perMonth")}`}</p>
        ) : null}
        <PlanFeatureList items={paidFeatures(plan)} />
      </div>

      <div className={styles.planCta}>
        {isCurrent ? (
          <div className={styles.planCurrentCta} role="status" aria-current="true">
            {t("billing.currentPlan")}
          </div>
        ) : isPending ? (
          <div className={styles.planPendingCta} role="status">
            {t("billing.pendingConfirmation")}
          </div>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="subscribe" />
            <input type="hidden" name="planKey" value={plan.planKey} />
            <button type="submit" className={styles.planPrimaryCta} disabled={isSubmitting}>
              {isSubmitting ? t("billing.redirectingToCheckout") : t("billing.subscribe")}
            </button>
          </Form>
        )}
      </div>
    </article>
  );
}

export function BillingPage() {
  const {
    billing,
    trialPlan,
    subscriptionPlans,
    tokenPacks,
    usageHistory,
    billingHistory,
    toolUsageHistory,
    showDevCancelSubscription,
  } = useLoaderData<typeof loader>();
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
  const [showAccountDetailPage, setShowAccountDetailPage] = useState(false);

  const basePlan = pickSubscriptionPlan(subscriptionPlans, interval, "base");
  const proPlan = pickSubscriptionPlan(subscriptionPlans, interval, "pro");
  const paidPlansForInterval = useMemo(
    () => listSubscriptionPlansForInterval(subscriptionPlans, interval),
    [subscriptionPlans, interval],
  );
  const paidPlansToShow = useMemo(() => {
    if (basePlan || proPlan) {
      return [basePlan, proPlan].filter((p): p is PlanRecord => Boolean(p));
    }
    return paidPlansForInterval;
  }, [basePlan, proPlan, paidPlansForInterval]);
  const sub = billing.subscription;

  const showSubscriptionPeriodMeta =
    sub?.status === "ACTIVE" && !!sub.currentPeriodEnd;

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

  const tokenCapacity = billing.availableTokens;
  const usagePercent = getTokenUsagePercent(billing.usedTokens, tokenCapacity);
  const usagePercentDisplay = formatTokenUsagePercentDisplay(usagePercent);
  const usagePercentForBar = Math.min(100, Math.max(0, usagePercent));
  const currentSubscriptionTier =
    sub?.status === "ACTIVE" || sub?.status === "PENDING"
      ? planTierFromPlanKey(sub.planKey)
      : null;
  const recommendedTier: PlanTier =
    currentSubscriptionTier ?? (interval === "MONTHLY" ? "base" : "pro");
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

  const allPlans = useMemo(
    () => [trialPlan, ...subscriptionPlans, ...tokenPacks].filter((plan): plan is PlanRecord => Boolean(plan)),
    [subscriptionPlans, tokenPacks, trialPlan],
  );

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

  const faqItems = [
    {
      question: t("billing.faqBillingQuestion"),
      answer: t("billing.faqBillingAnswer"),
    },
    {
      question: t("billing.faqPackQuestion"),
      answer: t("billing.faqPackAnswer"),
    },
    {
      question: t("billing.faqWhenQuestion"),
      answer: t("billing.faqWhenAnswer"),
    },
    {
      question: t("billing.faqRefundQuestion"),
      answer: t("billing.faqRefundAnswer"),
    },
  ];

  const accountSummaryItems = [
    {
      key: "available",
      label: t("billing.summaryAvailableCredits"),
      value: billing.availableTokens.toLocaleString(),
    },
    {
      key: "status",
      label: t("billing.summarySubscriptionStatus"),
      value: sub ? t(`billing.status.${sub.status}`) : t("billing.noSubscription"),
    },
    {
      key: "period",
      label: t("billing.summaryCurrentPeriod"),
      value:
        sub?.currentPeriodStart && sub?.currentPeriodEnd
          ? `${formatDate(sub.currentPeriodStart, locale)} - ${formatDate(sub.currentPeriodEnd, locale)}`
          : EMPTY,
    },
  ];

  if (showAccountDetailPage) {
    return (
      <s-page heading={t("billing.accountDetailPageTitle")}>
        <div style={pageContentStyle}>
          <section className={styles.accountDetailPage}>
            <div className={styles.accountDetailHeader}>
              <button
                type="button"
                className={styles.backLinkButton}
                onClick={() => setShowAccountDetailPage(false)}
              >
                {t("billing.backToBilling")}
              </button>
              <div className={styles.sectionHeadMain}>
                <h2 className={styles.sectionTitle}>{t("billing.accountSectionTitle")}</h2>
                <p className={styles.sectionSubtitle}>
                  {t("billing.accountDetailPageSubtitle")}
                </p>
              </div>
            </div>

            <div className={styles.accountStack}>
              <article className={styles.accountCard}>
                <div className={styles.accountCardHeader}>
                  <h3 className={styles.accountCardTitle}>{t("billing.sectionSubscription")}</h3>
                  <span className={styles.accountCardBadge}>{currentPlanLabel}</span>
                </div>
                <dl className={styles.accountFacts}>
                  <div className={styles.accountFact}>
                    <dt>{t("billing.summarySubscriptionStatus")}</dt>
                    <dd>
                      {sub ? t(`billing.status.${sub.status}`) : t("billing.noSubscription")}
                    </dd>
                  </div>
                  <div className={styles.accountFact}>
                    <dt>{t("billing.summaryCurrentPeriod")}</dt>
                    <dd>
                      {sub?.currentPeriodStart && sub?.currentPeriodEnd
                        ? `${formatDate(sub.currentPeriodStart, locale)} - ${formatDate(sub.currentPeriodEnd, locale)}`
                        : EMPTY}
                    </dd>
                  </div>
                  <div className={styles.accountFact}>
                    <dt>{t("billing.summaryAvailableCredits")}</dt>
                    <dd>{billing.availableTokens.toLocaleString()}</dd>
                  </div>
                  <div className={styles.accountFact}>
                    <dt>{t("billing.summaryUsedCredits")}</dt>
                    <dd>{billing.usedTokens.toLocaleString()}</dd>
                  </div>
                </dl>
              </article>

              <article className={styles.accountCard}>
                <div className={styles.accountCardHeader}>
                  <h3 className={styles.accountCardTitle}>{t("billing.historyTitle")}</h3>
                  <span className={styles.accountCardMeta}>
                    {t("billing.historyCount", {
                      count: billingHistory.length,
                    })}
                  </span>
                </div>
                {billingHistory.length > 0 ? (
                  <div className={styles.historyList}>
                    {billingHistory.slice(0, 6).map((item) => (
                      <div key={item.id} className={styles.historyItem}>
                        <div className={styles.historyItemTop}>
                          <span
                            className={`${styles.historyTone} ${resolveBillingEventToneClass(item.eventType, styles)}`}
                          >
                            {resolveBillingEventLabel(item.eventType, t)}
                          </span>
                          <span className={styles.historyTimestamp}>
                            {formatDateTime(item.createdAt, locale)}
                          </span>
                        </div>
                        <div className={styles.historyItemMeta}>
                          <span>
                            {t("billing.historyPlanLabel")}:{" "}
                            {resolvePlanDisplayName(item.planKey, allPlans)}
                          </span>
                          {item.tokensDelta != null ? (
                            <span
                              className={
                                item.tokensDelta >= 0
                                  ? styles.historyDeltaPositive
                                  : styles.historyDeltaNegative
                              }
                            >
                              {item.tokensDelta >= 0 ? "+" : ""}
                              {item.tokensDelta.toLocaleString()} {t("billing.tokenUnit")}
                            </span>
                          ) : null}
                          {item.usedTokens != null ? (
                            <span>
                              {t("billing.historyUsedLabel", {
                                count: item.usedTokens.toLocaleString(),
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>{t("billing.historyEmpty")}</div>
                )}
              </article>

              <article className={styles.accountCard}>
                <div className={styles.accountCardHeader}>
                  <h3 className={styles.accountCardTitle}>{t("billing.usageHistoryTitle")}</h3>
                  <span className={styles.accountCardMeta}>
                    {t("billing.historyCount", {
                      count: usageHistory.length,
                    })}
                  </span>
                </div>
                {usageHistory.length > 0 ? (
                  <div className={styles.periodList}>
                    {usageHistory.slice(0, 4).map((item: BillingUsagePeriodItem) => (
                      <div key={item.id} className={styles.periodItem}>
                        <div className={styles.periodItemTop}>
                          <span className={styles.periodPlan}>
                            {resolvePlanDisplayName(item.planKey, allPlans)}
                          </span>
                          <span className={styles.historyTimestamp}>
                            {formatDate(item.periodStart, locale)} - {formatDate(item.periodEnd, locale)}
                          </span>
                        </div>
                        <div className={styles.periodStats}>
                          <span>
                            {t("billing.periodUsageLabel", {
                              used: item.usedTokens.toLocaleString(),
                              total: item.subscriptionTokensAllocated.toLocaleString(),
                            })}
                          </span>
                          <span>
                            {t("billing.periodCarryLabel", {
                              purchased: item.purchasedTokensRemaining.toLocaleString(),
                              trial: item.trialTokensRemaining.toLocaleString(),
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>{t("billing.usageHistoryEmpty")}</div>
                )}
              </article>
            </div>
          </section>
        </div>
      </s-page>
    );
  }

  return (
    <s-page
      heading={t("billing.pageTitle")}
      style={{ overflow: "visible", height: "auto", minHeight: "auto" }}
    >
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
            <div className={styles.usageHeaderBadge}>
              {showSubscriptionPeriodMeta && sub ? (
                <div className={styles.subscriptionMetaList}>
                  <span className={styles.subscriptionMetaItem}>
                    {t("billing.periodEnd")}:{" "}
                    {formatBillingMetaDate(sub.currentPeriodEnd, locale)}
                  </span>
                  {sub.trialEndsAt ? (
                    <span className={styles.subscriptionMetaItem}>
                      {t("billing.trialEnds")}:{" "}
                      {formatBillingMetaDate(sub.trialEndsAt, locale)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <span className={styles.planBadge}>{currentPlanLabel}</span>
            </div>
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
                  {t("billing.usagePercentUsed", { percent: usagePercentDisplay })}
                </span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usagePercentForBar}
                aria-label={t("billing.quotaProgressAria", {
                  percent: usagePercentDisplay,
                })}
              >
                <div
                  className={`${styles.progressFill} ${usageLow ? styles.progressFillLow : ""}`}
                  style={{ width: `${usagePercentForBar}%` }}
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
          {showDevCancelSubscription ? (
            <div className={styles.quotaFooter}>
              <span className={styles.quotaFooterSpacer} aria-hidden />
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
            </div>
          ) : null}
        </section>

        <section className={styles.accountEntrySection}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadMain}>
              <h2 className={styles.sectionTitle}>{t("billing.accountSectionTitle")}</h2>
              <p className={styles.sectionSubtitle}>{t("billing.accountSectionSubtitle")}</p>
            </div>
            <button
              type="button"
              className={styles.secondaryEntryButton}
              onClick={() => setShowAccountDetailPage(true)}
            >
              {t("billing.openAccountDetailPage")}
            </button>
          </div>
          <div className={styles.accountEntryCard}>
            <div className={styles.accountEntrySummary}>
              {accountSummaryItems.map((item) => (
                <div key={item.key} className={styles.accountEntryItem}>
                  <span className={styles.accountEntryLabel}>{item.label}</span>
                  <span className={styles.accountEntryValue}>{item.value}</span>
                </div>
              ))}
            </div>
            <p className={styles.accountEntryHint}>{t("billing.accountEntryHint")}</p>
          </div>
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

              {paidPlansToShow.map((plan) => {
                const tier = planTierFromPlanKey(plan.planKey);
                const isRecommended = tier === recommendedTier;
                return (
                  <PaidPlanCard
                    key={plan.planKey}
                    plan={plan}
                    interval={interval}
                    isRecommended={isRecommended}
                    isCurrent={isActiveSubscriptionPlan(plan.planKey, sub)}
                    isPending={isPendingSubscriptionPlan(plan.planKey, sub)}
                    isSubmitting={subscribingPlanKey === plan.planKey}
                    locale={locale}
                    t={t}
                    paidFeatures={paidFeatures}
                  />
                );
              })}
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
                <div className={styles.packCheckoutBar}>
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
                  <Form method="post" className={styles.packCtaInline}>
                    <input type="hidden" name="intent" value="buy_pack" />
                    <input type="hidden" name="planKey" value={selectedPack.planKey} />
                    <button
                      type="submit"
                      className={styles.packBuyButton}
                      disabled={Boolean(buyingPackKey)}
                    >
                      {buyingPackKey
                        ? t("billing.redirectingToCheckout")
                        : t("billing.purchaseCredits")}
                    </button>
                  </Form>
                </div>
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

        <section className={styles.faqSection}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadMain}>
              <h2 className={styles.sectionTitle}>{t("billing.faqTitle")}</h2>
              <p className={styles.sectionSubtitle}>{t("billing.faqSubtitle")}</p>
            </div>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <article key={item.question} className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>{item.question}</h3>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <p className={styles.trustCheckout}>{t("billing.trustCheckout")}</p>
      </div>
    </s-page>
  );
}
