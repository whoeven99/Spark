import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  BillingHistoryItem,
  BillingToolUsageItem,
  PlanRecord,
} from "../../lib/billingPageTypes";
import type { loader, action } from "../app.billing";
import {
  computeAnnualDiscountPercent,
  formatPlanTagLabel,
  formatAnnualMonthlyEquivalent,
  formatPlanPrice,
  formatTokenUsagePercentDisplay,
  getTokenUsagePercent,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  listSubscriptionPlansForInterval,
  normalizePlanDisplayName,
  pickSubscriptionPlan,
  planTierFromPlanKey,
  type BillingIntervalView,
  type PlanTier,
} from "../../lib/billingPlanUi";
import styles from "../component/billing/billingPage.module.css";
import { pageContentStyle } from "./pageUiStyles";

const EMPTY = "-";
const MOCK_PLAN_SUFFIX = "_mock";
const ALL_PLANS_MOCKED = true;
const PLAN_TIER_ORDER: Record<PlanTier, number> = {
  base: 0,
  pro: 1,
  premium: 2,
};

function clonePlan(plan: PlanRecord, overrides: Partial<PlanRecord>): PlanRecord {
  return { ...plan, ...overrides };
}

function createMockPlan(params: {
  appName: string;
  planKey: string;
  billingInterval: "MONTHLY" | "ANNUAL";
  displayName: string;
  tokens: number;
  priceAmount: string;
  currencyCode: string;
  trialDays: number | null;
}): PlanRecord {
  return {
    planKey: `${params.planKey}${MOCK_PLAN_SUFFIX}`,
    appName: params.appName,
    kind: "SUBSCRIPTION",
    billingInterval: params.billingInterval,
    displayName: params.displayName,
    tokens: params.tokens,
    priceAmount: params.priceAmount,
    currencyCode: params.currencyCode,
    trialDays: params.trialDays,
    shopifyPlanName: null,
  };
}

function isMockVisualPlan(plan: PlanRecord): boolean {
  return plan.planKey.endsWith(MOCK_PLAN_SUFFIX);
}

function buildMockBillingPlans(params: {
  appName: string;
  trialPlan: PlanRecord | null;
  subscriptionPlans: PlanRecord[];
}): { trialPlan: PlanRecord | null; subscriptionPlans: PlanRecord[] } {
  const currencyCode =
    params.subscriptionPlans[0]?.currencyCode ?? params.trialPlan?.currencyCode ?? "USD";
  const baseMonthly = pickSubscriptionPlan(params.subscriptionPlans, "MONTHLY", "base");
  const baseAnnual = pickSubscriptionPlan(params.subscriptionPlans, "ANNUAL", "base");
  const proMonthly = pickSubscriptionPlan(params.subscriptionPlans, "MONTHLY", "pro");
  const proAnnual = pickSubscriptionPlan(params.subscriptionPlans, "ANNUAL", "pro");
  const premiumMonthly = pickSubscriptionPlan(params.subscriptionPlans, "MONTHLY", "premium");
  const premiumAnnual = pickSubscriptionPlan(params.subscriptionPlans, "ANNUAL", "premium");

  const trialPlan = params.trialPlan
    ? clonePlan(params.trialPlan, {
        displayName: "Free plan",
        tokens: 10000,
        priceAmount: "0",
      })
    : null;

  const mockedPlans: PlanRecord[] = [];

  if (baseMonthly) {
    mockedPlans.push(
      clonePlan(baseMonthly, {
        displayName: "Basic (Monthly)",
        tokens: 500000,
        priceAmount: "9.99",
        trialDays: 7,
      }),
    );
  }
  if (baseAnnual) {
    mockedPlans.push(
      clonePlan(baseAnnual, {
        displayName: "Basic (Annual)",
        tokens: 6500000,
        priceAmount: "99.99",
        trialDays: 7,
      }),
    );
  }
  if (proMonthly) {
    mockedPlans.push(
      clonePlan(proMonthly, {
        displayName: "Pro (Monthly)",
        tokens: 2500000,
        priceAmount: "39.99",
        trialDays: 7,
      }),
    );
  }
  if (proAnnual) {
    mockedPlans.push(
      clonePlan(proAnnual, {
        displayName: "Pro (Annual)",
        tokens: 32500000,
        priceAmount: "399.99",
        trialDays: 7,
      }),
    );
  }

  mockedPlans.push(
    premiumMonthly ??
      createMockPlan({
        appName: params.appName,
        planKey: "pi_premium_monthly",
        billingInterval: "MONTHLY",
        displayName: "Premium (Monthly)",
        tokens: 10000000,
        priceAmount: "99.99",
        currencyCode,
        trialDays: 7,
      }),
  );
  mockedPlans.push(
    premiumAnnual ??
      createMockPlan({
        appName: params.appName,
        planKey: "pi_premium_annual",
        billingInterval: "ANNUAL",
        displayName: "Premium (Annual)",
        tokens: 130000000,
        priceAmount: "999.99",
        currencyCode,
        trialDays: 7,
      }),
  );

  return {
    trialPlan,
    subscriptionPlans: mockedPlans,
  };
}

function compareColumnClass(
  column: string,
  emphasizedTier: PlanTier | null,
): string {
  if (emphasizedTier && column === emphasizedTier) return styles.compareColHighlight;
  return "";
}

function sortPlansByTier(plans: PlanRecord[]): PlanRecord[] {
  return [...plans].sort((left, right) => {
    const leftTier = planTierFromPlanKey(left.planKey);
    const rightTier = planTierFromPlanKey(right.planKey);
    const leftRank = leftTier ? PLAN_TIER_ORDER[leftTier] : Number.MAX_SAFE_INTEGER;
    const rightRank = rightTier ? PLAN_TIER_ORDER[rightTier] : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

function resolveRecommendedTier(currentTier: PlanTier | null): PlanTier | null {
  if (!currentTier) return "pro";
  if (currentTier === "base") return "pro";
  if (currentTier === "pro") return "premium";
  return null;
}

function booleanPlanCapability(locale: string, supported: boolean): string {
  void locale;
  return supported ? "✅" : "❌";
}

function planCompareValue(
  plan: PlanRecord | null,
  capability:
    | "credits"
    | "trial"
    | "text"
    | "image"
    | "video"
    | "crossApp"
    | "transfer"
    | "support",
  locale: string,
): string {
  if (!plan) return EMPTY;
  const tier = planTierFromPlanKey(plan.planKey);
  const isZh = locale.toLowerCase().startsWith("zh");
  switch (capability) {
    case "credits":
      return isZh
        ? `${plan.tokens.toLocaleString(locale)} / 周期`
        : `${plan.tokens.toLocaleString(locale)} / period`;
    case "trial":
      return plan.trialDays ? `${plan.trialDays}` : EMPTY;
    case "text":
      return isZh
        ? "Google、ChatGPT、Claude"
        : "Google, ChatGPT, Claude";
    case "image":
      return booleanPlanCapability(locale, tier === "pro" || tier === "premium");
    case "video":
      return booleanPlanCapability(locale, tier === "premium");
    case "crossApp":
      return booleanPlanCapability(locale, tier === "premium");
    case "transfer":
      return booleanPlanCapability(locale, tier === "premium");
    case "support":
      return booleanPlanCapability(locale, true);
    default:
      return EMPTY;
  }
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

function resolvePlanDisplayName(
  planKey: string | null,
  plans: PlanRecord[],
  freePlanLabel: string,
): string {
  if (!planKey) return EMPTY;
  const match = plans.find((plan) => plan.planKey === planKey);
  if (
    match?.kind === "INTERNAL_TRIAL" ||
    /free\s+trial/i.test(match?.displayName ?? "") ||
    planKey.includes("trial")
  ) {
    return freePlanLabel;
  }
  return normalizePlanDisplayName(match?.displayName ?? planKey, planKey);
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

function resolveLedgerToneClass(
  entry: RecentLedgerEntry,
  stylesMap: Record<string, string>,
): string {
  if (entry.kind === "usage") return stylesMap.historyToneWarning;
  return resolveBillingEventToneClass(entry.eventType, stylesMap);
}

type PlanFeatureItem = {
  text: string;
  included?: boolean;
};

type RecentLedgerEntry =
  | {
      kind: "billing";
      id: string;
      createdAt: string;
      eventType: BillingHistoryItem["eventType"];
      planKey: string | null;
      tokensDelta: number | null;
      usedTokens: number | null;
    }
  | {
      kind: "usage";
      id: string;
      createdAt: string;
      feature: BillingToolUsageItem["feature"];
      modelKey: string;
      rawTokens: number;
      billedTokens: number;
    };

function buildPaidPlanFeatures(plan: PlanRecord, locale: string): PlanFeatureItem[] {
  const tier = planTierFromPlanKey(plan.planKey);
  const count = plan.tokens.toLocaleString(locale);
  if (locale.toLowerCase().startsWith("zh")) {
    if (tier === "base") {
      return [
        { text: `每周期获得 ${count} 积分` },
        { text: "支持使用 Google、ChatGPT、Claude 等最新文本模型，不支持图片和视频模型" },
        { text: "不支持跨 app 使用", included: false },
        { text: "人工支持" },
      ];
    }
    if (tier === "pro") {
      return [
        { text: `每周期获得 ${count} 积分` },
        { text: "支持使用 Google、ChatGPT、Claude 等最新文本模型" },
        { text: "支持 ChatGPT Images、Nano Banana 等图片模型，不支持视频模型" },
        { text: "人工支持" },
      ];
    }
    if (tier === "premium") {
      return [
        { text: `每周期获得 ${count} 积分` },
        { text: "支持使用 Google、ChatGPT、Claude 等最新文本模型" },
        { text: "支持 ChatGPT Images、Nano Banana 等图片模型" },
        { text: "支持 Seedance、Sora 等视频模型" },
        { text: "支持跨 app 使用积分（Ciwi 品牌下 App）" },
        { text: "支持积分转移（在两个同名商店之间）" },
        { text: "人工支持" },
      ];
    }
  } else {
    if (tier === "base") {
      return [
        { text: `${count} credits per period` },
        { text: "Access to latest text models including Google, ChatGPT, and Claude; no image or video models" },
        { text: "No cross-app credit sharing", included: false },
        { text: "Human support" },
      ];
    }
    if (tier === "pro") {
      return [
        { text: `${count} credits per period` },
        { text: "Access to latest text models including Google, ChatGPT, and Claude" },
        { text: "Supports image models such as ChatGPT Images and Nano Banana; no video models" },
        { text: "Human support" },
      ];
    }
    if (tier === "premium") {
      return [
        { text: `${count} credits per period` },
        { text: "Access to latest text models including Google, ChatGPT, and Claude" },
        { text: "Supports image models such as ChatGPT Images and Nano Banana" },
        { text: "Supports video models such as Seedance and Sora" },
        { text: "Supports cross-app credit usage across Ciwi apps" },
        { text: "Supports credit transfer between stores with the same name" },
        { text: "Human support" },
      ];
    }
  }
  return [{ text: `${count} ${locale.toLowerCase().startsWith("zh") ? "积分" : "credits"}` }];
}

function PlanFeatureList({ items }: { items: PlanFeatureItem[] }) {
  return (
    <ul className={styles.planFeatures}>
      {items.map((item) => (
        <li key={item.text} className={styles.planFeature}>
          <span
            className={item.included === false ? styles.minusIcon : styles.checkIcon}
            aria-hidden
          >
            {item.included === false ? "\u2212" : "\u2713"}
          </span>
          <span>{item.text}</span>
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
  submittingMode,
  mockOnly,
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
  submittingMode: "trial" | "paid" | null;
  mockOnly: boolean;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  paidFeatures: (plan: PlanRecord) => PlanFeatureItem[];
}) {
  const periodSuffix = interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth");
  const monthlyEquivalent =
    interval === "ANNUAL" ? formatAnnualMonthlyEquivalent(plan, locale) : null;
  const hasTrial = Boolean(plan.trialDays && plan.trialDays > 0);

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
        <h3 className={styles.planName}>
          {normalizePlanDisplayName(plan.displayName, plan.planKey)}
        </h3>
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
          <div className={styles.planCtaGroup}>
            {hasTrial ? (
              <Form method="post" className={styles.planActionForm}>
                <input type="hidden" name="intent" value="subscribe" />
                <input type="hidden" name="planKey" value={plan.planKey} />
                <input type="hidden" name="trialMode" value="trial" />
                <button
                  type="submit"
                  className={styles.planPrimaryCta}
                  disabled={isSubmitting || mockOnly}
                  title={mockOnly ? "当前为前端 mock 展示，暂不支持结账" : undefined}
                >
                  {isSubmitting && submittingMode === "trial"
                    ? t("billing.redirectingToCheckout")
                    : t("billing.trialDays", { count: plan.trialDays ?? 0 })}
                </button>
              </Form>
            ) : null}
            <Form method="post" className={styles.planActionForm}>
              <input type="hidden" name="intent" value="subscribe" />
              <input type="hidden" name="planKey" value={plan.planKey} />
              <input type="hidden" name="trialMode" value="paid" />
              <button
                type="submit"
                className={hasTrial ? styles.planSecondaryCta : styles.planPrimaryCta}
                disabled={isSubmitting || mockOnly}
                title={mockOnly ? "当前为前端 mock 展示，暂不支持结账" : undefined}
              >
                {isSubmitting && submittingMode === "paid"
                  ? t("billing.redirectingToCheckout")
                  : t("billing.subscribe")}
              </button>
            </Form>
          </div>
        )}
      </div>
    </article>
  );
}

export function BillingPage() {
  const {
    appName,
    billing,
    trialPlan: rawTrialPlan,
    subscriptionPlans: rawSubscriptionPlans,
    tokenPacks,
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
  const subscribingMode =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "subscribe"
      ? ((navigation.formData.get("trialMode")?.toString() ?? "trial") as "trial" | "paid")
      : null;
  const buyingPackKey =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "buy_pack"
      ? String(navigation.formData.get("planKey") ?? "")
      : "";
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const mockedBillingPlans = useMemo(
    () =>
      buildMockBillingPlans({
        appName,
        trialPlan: rawTrialPlan,
        subscriptionPlans: rawSubscriptionPlans,
      }),
    [appName, rawSubscriptionPlans, rawTrialPlan],
  );
  const trialPlan = mockedBillingPlans.trialPlan;
  const subscriptionPlans = mockedBillingPlans.subscriptionPlans;

  const baseMonthly = pickSubscriptionPlan(subscriptionPlans, "MONTHLY", "base");
  const baseAnnual = pickSubscriptionPlan(subscriptionPlans, "ANNUAL", "base");
  const proMonthly = pickSubscriptionPlan(subscriptionPlans, "MONTHLY", "pro");
  const proAnnual = pickSubscriptionPlan(subscriptionPlans, "ANNUAL", "pro");
  const premiumMonthly = pickSubscriptionPlan(subscriptionPlans, "MONTHLY", "premium");
  const premiumAnnual = pickSubscriptionPlan(subscriptionPlans, "ANNUAL", "premium");

  const baseAnnualDiscount = useMemo(() => {
    if (!baseMonthly || !baseAnnual) return null;
    return computeAnnualDiscountPercent(baseMonthly, baseAnnual);
  }, [baseMonthly, baseAnnual]);

  const proAnnualDiscount = useMemo(() => {
    if (!proMonthly || !proAnnual) return null;
    return computeAnnualDiscountPercent(proMonthly, proAnnual);
  }, [proMonthly, proAnnual]);

  const premiumAnnualDiscount = useMemo(() => {
    if (!premiumMonthly || !premiumAnnual) return null;
    return computeAnnualDiscountPercent(premiumMonthly, premiumAnnual);
  }, [premiumMonthly, premiumAnnual]);

  const headerAnnualDiscount =
    premiumAnnualDiscount ?? proAnnualDiscount ?? baseAnnualDiscount;

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
  const [historyPage, setHistoryPage] = useState(1);

  const paidPlansForInterval = useMemo(
    () => sortPlansByTier(listSubscriptionPlansForInterval(subscriptionPlans, interval)),
    [subscriptionPlans, interval],
  );
  const paidPlansToShow = paidPlansForInterval;
  const sub = billing.subscription;

  const showSubscriptionPeriodMeta =
    sub?.status === "ACTIVE" && !!sub.currentPeriodEnd;

  const isTrialCurrent =
    sub?.status !== "ACTIVE" &&
    sub?.status !== "PENDING" &&
    billing.account.trialTokens > 0;

  const currentPlanRecord = useMemo(
    () => subscriptionPlans.find((plan) => plan.planKey === sub?.planKey) ?? null,
    [sub?.planKey, subscriptionPlans],
  );
  const currentPlanTagLabel = useMemo(() => {
    if (currentPlanRecord) {
      return formatPlanTagLabel(currentPlanRecord.displayName, currentPlanRecord.planKey);
    }
    if (isTrialCurrent) {
      return t("billing.planFree");
    }
    return t("billing.planFree");
  }, [currentPlanRecord, isTrialCurrent, t]);
  const quotaMetaDescription = useMemo(() => {
    const meta: string[] = [];
    if (showSubscriptionPeriodMeta && sub?.currentPeriodEnd) {
      meta.push(`${t("billing.periodEnd")}: ${formatBillingMetaDate(sub.currentPeriodEnd, locale)}`);
    }
    if (sub?.trialEndsAt) {
      meta.push(`${t("billing.trialEnds")}: ${formatBillingMetaDate(sub.trialEndsAt, locale)}`);
    }
    return meta.join(" · ");
  }, [locale, showSubscriptionPeriodMeta, sub?.currentPeriodEnd, sub?.trialEndsAt, t]);

  const tokenCapacity = billing.availableTokens;
  const usagePercent = getTokenUsagePercent(billing.usedTokens, tokenCapacity);
  const usagePercentDisplay = formatTokenUsagePercentDisplay(usagePercent);
  const usagePercentForBar = Math.min(100, Math.max(0, usagePercent));
  const currentSubscriptionTier =
    sub?.status === "ACTIVE" || sub?.status === "PENDING"
      ? planTierFromPlanKey(sub.planKey)
      : null;
  const recommendedTier = resolveRecommendedTier(currentSubscriptionTier);
  const emphasizedTier = currentSubscriptionTier ?? recommendedTier;
  const usageLow = usagePercent >= 85;

  if (actionData?.ok && "noopCheckout" in actionData && actionData.noopCheckout) {
    shopify.toast.show(t("billing.checkoutCompleteNoRedirect"));
  } else if (actionData?.ok && "cancelled" in actionData && actionData.cancelled) {
    shopify.toast.show(t("billing.cancelSubscriptionSuccess"));
  } else if (actionData && !actionData.ok) {
    shopify.toast.show(actionData.error);
  }

  const paidFeatures = (plan: PlanRecord) => buildPaidPlanFeatures(plan, locale);

  const periodSuffix =
    interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth");

  const formatPlanPriceWithPeriod = (plan: PlanRecord) =>
    `${formatPlanPrice(plan.priceAmount, plan.currencyCode, locale)}${periodSuffix}`;

  const allPlans = useMemo(
    () => [trialPlan, ...subscriptionPlans, ...tokenPacks].filter((plan): plan is PlanRecord => Boolean(plan)),
    [subscriptionPlans, tokenPacks, trialPlan],
  );
  const recentLedgerEntries = useMemo<RecentLedgerEntry[]>(
    () => {
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
      return [
        ...billingHistory.map(
          (item): RecentLedgerEntry => ({
            kind: "billing",
            id: item.id,
            createdAt: item.createdAt,
            eventType: item.eventType,
            planKey: item.planKey,
            tokensDelta: item.tokensDelta,
            usedTokens: item.usedTokens,
          }),
        ),
        ...toolUsageHistory.map(
          (item): RecentLedgerEntry => ({
            kind: "usage",
            id: item.id,
            createdAt: item.createdAt,
            feature: item.feature,
            modelKey: item.modelKey,
            rawTokens: item.rawTokens,
            billedTokens: item.billedTokens,
          }),
        ),
      ]
        .filter((item) => new Date(item.createdAt).getTime() >= cutoff)
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        );
    },
    [billingHistory, toolUsageHistory],
  );
  const historyPageSize = 10;
  const totalHistoryPages = Math.max(
    1,
    Math.ceil(recentLedgerEntries.length / historyPageSize),
  );
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedLedgerEntries = useMemo(
    () =>
      recentLedgerEntries.slice(
        (safeHistoryPage - 1) * historyPageSize,
        safeHistoryPage * historyPageSize,
      ),
    [recentLedgerEntries, safeHistoryPage],
  );

  useEffect(() => {
    if (historyPage > totalHistoryPages) {
      setHistoryPage(totalHistoryPages);
    }
  }, [historyPage, totalHistoryPages]);

  const compareRows: { label: string; values: string[] }[] = [
    {
      label:
        interval === "MONTHLY"
          ? t("billing.compareMonthlyPrice")
          : t("billing.compareAnnualPrice"),
      values: [
        formatPlanPrice("0", trialPlan?.currencyCode ?? "USD", locale),
        ...paidPlansToShow.map((plan) => formatPlanPriceWithPeriod(plan)),
      ],
    },
    {
      label: t("billing.compareAnnualDiscount"),
      values: [
        EMPTY,
        ...paidPlansToShow.map((plan) => {
          const tier = planTierFromPlanKey(plan.planKey);
          const discount =
            tier === "base"
              ? baseAnnualDiscount
              : tier === "pro"
                ? proAnnualDiscount
                : tier === "premium"
                  ? premiumAnnualDiscount
                  : null;
          return discount != null
            ? t("billing.discountPercent", { percent: discount })
            : EMPTY;
        }),
      ],
    },
    {
      label: t("billing.compareTokens"),
      values: [
        trialPlan?.tokens.toLocaleString() ?? EMPTY,
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "credits", locale)),
      ],
    },
    {
      label: t("billing.compareTrialDays"),
      values: [
        EMPTY,
        ...paidPlansToShow.map((plan) => plan.trialDays?.toString() ?? EMPTY),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "文本模型" : "Text models",
      values: [
        locale.toLowerCase().startsWith("zh") ? "仅 Google" : "Google only",
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "text", locale)),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "图片模型" : "Image models",
      values: [
        booleanPlanCapability(locale, false),
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "image", locale)),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "视频模型" : "Video models",
      values: [
        booleanPlanCapability(locale, false),
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "video", locale)),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "跨 app 使用积分" : "Cross-app credits",
      values: [
        booleanPlanCapability(locale, false),
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "crossApp", locale)),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "积分转移" : "Credit transfer",
      values: [
        booleanPlanCapability(locale, false),
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "transfer", locale)),
      ],
    },
    {
      label: locale.toLowerCase().startsWith("zh") ? "人工支持" : "Human support",
      values: [
        booleanPlanCapability(locale, false),
        ...paidPlansToShow.map((plan) => planCompareValue(plan, "support", locale)),
      ],
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
              <article className={`${styles.accountCard} ${styles.accountCardCompact}`}>
                <div className={styles.accountCardHeader}>
                  <h3 className={styles.accountCardTitle}>{t("billing.sectionSubscription")}</h3>
                  <span className={styles.accountCardBadge}>{currentPlanTagLabel}</span>
                </div>
                <div className={styles.subscriptionSummaryRow}>
                  <div className={styles.subscriptionStatusBlock}>
                    <span className={styles.subscriptionStatusLabel}>
                      {t("billing.summarySubscriptionStatus")}
                    </span>
                    <span className={styles.subscriptionStatusValue}>
                      {sub ? t(`billing.status.${sub.status}`) : t("billing.noSubscription")}
                    </span>
                  </div>
                  <div className={styles.subscriptionPeriodBlock}>
                    <span className={styles.subscriptionStatusLabel}>
                      {t("billing.summaryCurrentPeriod")}
                    </span>
                    <span className={styles.subscriptionPeriodValue}>
                      {sub?.currentPeriodStart && sub?.currentPeriodEnd
                        ? `${formatDate(sub.currentPeriodStart, locale)} - ${formatDate(sub.currentPeriodEnd, locale)}`
                        : EMPTY}
                    </span>
                  </div>
                </div>
                <dl className={styles.accountFactsCompact}>
                  <div className={styles.accountFactCompact}>
                    <dt>{t("billing.summaryAvailableCredits")}</dt>
                    <dd>{billing.availableTokens.toLocaleString()}</dd>
                  </div>
                  <div className={styles.accountFactCompact}>
                    <dt>{t("billing.summaryUsedCredits")}</dt>
                    <dd>{billing.usedTokens.toLocaleString()}</dd>
                  </div>
                  <div className={styles.accountFactCompact}>
                    <dt>{locale.toLowerCase().startsWith("zh") ? "已使用占比" : "Usage rate"}</dt>
                    <dd>{t("billing.usagePercentUsed", { percent: usagePercentDisplay })}</dd>
                  </div>
                  <div className={styles.accountFactCompact}>
                    <dt>{locale.toLowerCase().startsWith("zh") ? "当前计划" : "Current plan"}</dt>
                    <dd>{currentPlanTagLabel}</dd>
                  </div>
                </dl>
              </article>

              <article className={styles.accountCard}>
                <div className={styles.accountCardHeader}>
                  <h3 className={styles.accountCardTitle}>{t("billing.historyTitle")}</h3>
                  <span className={styles.accountCardMeta}>
                    {`${t("billing.historyCount", {
                      count: recentLedgerEntries.length,
                    })} · ${locale.toLowerCase().startsWith("zh") ? "最近 45 天" : "Last 45 days"}`}
                  </span>
                </div>
                {recentLedgerEntries.length > 0 ? (
                  <>
                    <div className={styles.historyList}>
                      {paginatedLedgerEntries.map((item) => (
                      <div key={`${item.kind}-${item.id}`} className={styles.historyItem}>
                        <div className={styles.historyItemTop}>
                          <div className={styles.historyMain}>
                            <span
                              className={`${styles.historyTone} ${resolveLedgerToneClass(item, styles)}`}
                            >
                              {item.kind === "billing"
                                ? resolveBillingEventLabel(item.eventType, t)
                                : locale.toLowerCase().startsWith("zh")
                                  ? "积分消耗"
                                  : "Credit usage"}
                            </span>
                            <div className={styles.historyItemMeta}>
                              {item.kind === "billing" ? (
                                <>
                                  <span>
                                    {t("billing.historyPlanLabel")}:{" "}
                                    {resolvePlanDisplayName(item.planKey, allPlans, t("billing.planFree"))}
                                  </span>
                                  {item.usedTokens != null ? (
                                    <span>
                                      {t("billing.historyUsedLabel", {
                                        count: item.usedTokens.toLocaleString(),
                                      })}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <span>{resolveToolUsageFeatureLabel(item.feature, t)}</span>
                                  <span>
                                    {locale.toLowerCase().startsWith("zh") ? "模型" : "Model"}:{" "}
                                    {item.modelKey}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className={styles.historySide}>
                            {item.kind === "billing" && item.tokensDelta != null ? (
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
                            ) : item.kind === "usage" ? (
                              <span className={styles.historyDeltaNegative}>
                                -{item.billedTokens.toLocaleString()} {t("billing.tokenUnit")}
                              </span>
                            ) : null}
                            <span className={styles.historyTimestamp}>
                              {formatDateTime(item.createdAt, locale)}
                            </span>
                          </div>
                        </div>
                      </div>
                      ))}
                    </div>
                    {totalHistoryPages > 1 ? (
                      <div className={styles.historyPagination}>
                        {safeHistoryPage > 1 ? (
                          <button
                            type="button"
                            className={styles.secondaryEntryButton}
                            onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                          >
                            {locale.toLowerCase().startsWith("zh") ? "上一页" : "Previous"}
                          </button>
                        ) : (
                          <span aria-hidden />
                        )}
                        <span className={styles.historyPaginationText}>
                          {locale.toLowerCase().startsWith("zh")
                            ? `第 ${safeHistoryPage} / ${totalHistoryPages} 页`
                            : `Page ${safeHistoryPage} / ${totalHistoryPages}`}
                        </span>
                        {safeHistoryPage < totalHistoryPages ? (
                          <button
                            type="button"
                            className={styles.secondaryEntryButton}
                            onClick={() =>
                              setHistoryPage((page) =>
                                Math.min(totalHistoryPages, page + 1),
                              )
                            }
                          >
                            {locale.toLowerCase().startsWith("zh") ? "下一页" : "Next"}
                          </button>
                        ) : (
                          <span aria-hidden />
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className={styles.emptyPanel}>{t("billing.historyEmpty")}</div>
                )}
              </article>
            </div>
          </section>
        </div>
      </s-page>
    );
  }

  return (
    <s-page heading={t("billing.pageTitle")}>
      <div
        style={{
          ...pageContentStyle,
          overflow: "visible",
          height: "auto",
          minHeight: "auto",
        }}
      >
        {!billing.hasAccess && billing.billingRequired ? (
          <s-banner tone="warning">{t("billing.lowBalanceWarning")}</s-banner>
        ) : null}

        <section className={styles.quotaSection}>
          <div className={styles.usageHeader}>
            <div className={styles.usageHeaderMain}>
              <div className={styles.usageTitleRow}>
                <h2 className={styles.usageTitle}>{t("billing.quotaTitle")}</h2>
                <span className={styles.planBadge}>{currentPlanTagLabel}</span>
                <button
                  type="button"
                  className={styles.secondaryEntryButton}
                  onClick={() => setShowAccountDetailPage(true)}
                >
                  {t("billing.openAccountDetailPage")}
                </button>
              </div>
              {quotaMetaDescription ? (
                <p className={styles.quotaSubtitle}>{quotaMetaDescription}</p>
              ) : null}
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
            </div>
          </div>
          <div className={styles.quotaFooter}>
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
            ) : (
              <span className={styles.quotaFooterSpacer} aria-hidden />
            )}
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
                    submittingMode={subscribingPlanKey === plan.planKey ? subscribingMode : null}
                    mockOnly={ALL_PLANS_MOCKED || isMockVisualPlan(plan)}
                    locale={locale}
                    t={t}
                    paidFeatures={paidFeatures}
                  />
                );
              })}
            </div>
            <div className={styles.freePlanEntryWrap}>
              <button type="button" className={styles.freePlanEntryButton}>
                {isTrialCurrent ? t("billing.currentPlan") : "切换为免费计划"}
              </button>
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

        {paidPlansToShow.length > 0 ? (
          <section className={styles.compareSection}>
            <h2 className={styles.compareTitle}>{t("billing.compareTitle")}</h2>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>{t("billing.compareFeatureCol")}</th>
                  <th>
                    {t("billing.planFree")}
                  </th>
                  {paidPlansToShow.map((plan) => {
                    const tier = planTierFromPlanKey(plan.planKey) ?? plan.planKey;
                    return (
                      <th key={plan.planKey} className={compareColumnClass(tier, emphasizedTier)}>
                        {normalizePlanDisplayName(plan.displayName, plan.planKey)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {row.values.map((value, index) => {
                      const key =
                        index === 0 ? "free" : (planTierFromPlanKey(paidPlansToShow[index - 1]?.planKey ?? "") ?? paidPlansToShow[index - 1]?.planKey ?? String(index));
                      return (
                        <td key={`${row.label}-${key}`} className={compareColumnClass(key, emphasizedTier)}>
                          {value}
                        </td>
                      );
                    })}
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
