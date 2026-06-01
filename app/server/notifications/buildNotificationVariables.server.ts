import type { UninstallSessionSnapshot } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import type { ShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import type { PlanRecord } from "../billing/plans/planCatalog.server";
import type { CreditReasonKey } from "./formatNotificationDisplay.server";
import { formatBillingIntervalLabel } from "./formatNotificationDisplay.server";
import type {
  AppLifecycleNotificationVariables,
  CreditAccountChange,
  PurchaseNotificationVariables,
  SubscriptionNotificationVariables,
} from "./types";

export { formatBillingIntervalLabel };

export function formatOccurredAtUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min} UTC`;
}

export function resolveRecipientName(
  _shop: string,
  _shopInfo?: ShopBasicInfo | null,
  sessionSnapshot?: UninstallSessionSnapshot | null,
): string {
  const firstName = sessionSnapshot?.firstName?.trim();
  if (firstName) return firstName;

  const email = sessionSnapshot?.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  return "";
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
  creditReasonKey?: CreditReasonKey;
}): CreditAccountChange {
  const changed =
    params.creditsChanged ??
    params.creditsAfter - params.creditsBefore;
  return {
    creditsChanged: changed,
    creditsBefore: params.creditsBefore,
    creditsAfter: params.creditsAfter,
    creditUnit: "",
    creditReasonKey: params.creditReasonKey,
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
  billingInterval?: string;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
  creditAccountChange?: CreditAccountChange;
}): SubscriptionNotificationVariables {
  return {
    ...baseFields({
      shop: params.shop,
      occurredAt: params.occurredAt,
      shopInfo: params.shopInfo,
      sessionSnapshot: params.sessionSnapshot,
    }),
    currentPlanName: params.currentPlanName,
    previousPlanName: params.previousPlanName,
    effectiveAtUtc: params.effectiveAtUtc,
    billingInterval: params.billingInterval,
    creditAccountChange: params.creditAccountChange,
  };
}

export function buildPurchaseCreatedVariables(params: {
  shop: string;
  occurredAt: Date;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
  creditAccountChange?: CreditAccountChange;
}): PurchaseNotificationVariables {
  return {
    ...baseFields({
      shop: params.shop,
      occurredAt: params.occurredAt,
      shopInfo: params.shopInfo,
      sessionSnapshot: params.sessionSnapshot,
    }),
    purchaseType: "creditPack",
    orderId: params.shopifyPurchaseId,
    planName: params.plan.displayName,
    amountUsd: params.plan.priceAmount
      ? `${params.plan.priceAmount}`
      : undefined,
    billingPeriodKind: "oneTime",
    creditAccountChange: params.creditAccountChange,
  };
}
