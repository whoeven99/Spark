import type { UninstallSessionSnapshot } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import type { ShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import type { PlanRecord } from "../billing/plans/planCatalog.server";
import type {
  AppLifecycleNotificationVariables,
  CreditAccountChange,
  PurchaseNotificationVariables,
  SubscriptionNotificationVariables,
} from "./types";

export function formatOccurredAtUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min} UTC`;
}

function formatDisplayName(snapshot?: UninstallSessionSnapshot | null): string {
  const first = snapshot?.firstName?.trim() ?? "";
  const last = snapshot?.lastName?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

export function resolveRecipientName(
  shop: string,
  shopInfo?: ShopBasicInfo | null,
  sessionSnapshot?: UninstallSessionSnapshot | null,
): string {
  const fromProfile = formatDisplayName(sessionSnapshot);
  if (fromProfile) return fromProfile;
  if (shopInfo?.name?.trim()) return shopInfo.name.trim();
  const email =
    sessionSnapshot?.email?.trim() ||
    shopInfo?.email?.trim() ||
    shopInfo?.contactEmail?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "商家";
}

function resolveShopDomain(shop: string, shopInfo?: ShopBasicInfo | null): string {
  return shopInfo?.myshopifyDomain?.trim() || shop.trim();
}

function resolveShopName(
  shop: string,
  shopInfo?: ShopBasicInfo | null,
): string {
  return shopInfo?.name?.trim() || resolveShopDomain(shop, shopInfo);
}

function baseFields(params: {
  shop: string;
  occurredAt: Date;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
}): Pick<
  AppLifecycleNotificationVariables,
  "shopName" | "shopDomain" | "occurredAtUtc" | "recipientName"
> {
  return {
    shopName: resolveShopName(params.shop, params.shopInfo),
    shopDomain: resolveShopDomain(params.shop, params.shopInfo),
    occurredAtUtc: formatOccurredAtUtc(params.occurredAt),
    recipientName: resolveRecipientName(
      params.shop,
      params.shopInfo,
      params.sessionSnapshot,
    ),
  };
}

export function buildCreditAccountChange(params: {
  creditsBefore: number;
  creditsAfter: number;
  creditsChanged?: number;
  reason?: string;
}): CreditAccountChange {
  const changed =
    params.creditsChanged ??
    params.creditsAfter - params.creditsBefore;
  return {
    creditsChanged: changed,
    creditsBefore: params.creditsBefore,
    creditsAfter: params.creditsAfter,
    creditUnit: "credits",
    reason: params.reason,
  };
}

export function buildAppInstalledVariables(params: {
  shop: string;
  installedAt: Date;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
}): AppLifecycleNotificationVariables {
  return {
    ...baseFields({
      shop: params.shop,
      occurredAt: params.installedAt,
      shopInfo: params.shopInfo,
      sessionSnapshot: params.sessionSnapshot,
    }),
    installedAtUtc: formatOccurredAtUtc(params.installedAt),
  };
}

export function buildAppUninstalledVariables(params: {
  shop: string;
  uninstalledAt: Date;
  sessionSnapshot?: UninstallSessionSnapshot | null;
}): AppLifecycleNotificationVariables {
  return {
    ...baseFields({
      shop: params.shop,
      occurredAt: params.uninstalledAt,
      sessionSnapshot: params.sessionSnapshot,
    }),
    installedAtUtc: undefined,
    uninstalledAtUtc: formatOccurredAtUtc(params.uninstalledAt),
  };
}

export function buildSubscriptionVariables(params: {
  shop: string;
  occurredAt: Date;
  currentPlanName: string;
  previousPlanName?: string;
  effectiveAtUtc?: string;
  billingPeriod?: string;
  sessionSnapshot?: UninstallSessionSnapshot | null;
  creditAccountChange?: CreditAccountChange;
}): SubscriptionNotificationVariables {
  return {
    shopName: resolveShopName(params.shop),
    shopDomain: resolveShopDomain(params.shop),
    occurredAtUtc: formatOccurredAtUtc(params.occurredAt),
    recipientName: resolveRecipientName(params.shop, null, params.sessionSnapshot),
    currentPlanName: params.currentPlanName,
    previousPlanName: params.previousPlanName,
    effectiveAtUtc: params.effectiveAtUtc,
    billingPeriod: params.billingPeriod,
    creditAccountChange: params.creditAccountChange,
  };
}

export function buildPurchaseCreatedVariables(params: {
  shop: string;
  occurredAt: Date;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  sessionSnapshot?: UninstallSessionSnapshot | null;
  creditAccountChange?: CreditAccountChange;
}): PurchaseNotificationVariables {
  return {
    shopName: resolveShopName(params.shop),
    shopDomain: resolveShopDomain(params.shop),
    occurredAtUtc: formatOccurredAtUtc(params.occurredAt),
    recipientName: resolveRecipientName(params.shop, null, params.sessionSnapshot),
    purchaseType: "creditPack",
    orderId: params.shopifyPurchaseId,
    planName: params.plan.displayName,
    amountUsd: params.plan.priceAmount
      ? `${params.plan.priceAmount}`
      : undefined,
    billingPeriod: undefined,
    creditAccountChange: params.creditAccountChange,
  };
}

export function formatBillingIntervalLabel(interval: string | null | undefined): string {
  if (!interval) return "";
  const normalized = interval.toUpperCase();
  if (normalized === "MONTHLY" || normalized === "EVERY_30_DAYS") return "月付";
  if (normalized === "ANNUAL" || normalized === "YEARLY") return "年付";
  return interval;
}
