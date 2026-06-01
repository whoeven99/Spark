import type { NotificationLocale } from "./types";

export type CreditReasonKey =
  | "credit_pack_purchased"
  | "subscription_started"
  | "subscription_changed"
  | "subscription_canceled";

export type BillingPeriodKind =
  | { kind: "oneTime" }
  | { kind: "subscription"; interval: string };

const CREDIT_REASON_LABELS: Record<
  CreditReasonKey,
  Record<NotificationLocale, string>
> = {
  credit_pack_purchased: {
    "zh-CN": "积分包购买",
    en: "Credit pack purchased",
  },
  subscription_started: {
    "zh-CN": "订阅生效",
    en: "Subscription activated",
  },
  subscription_changed: {
    "zh-CN": "订阅套餐变更",
    en: "Subscription plan changed",
  },
  subscription_canceled: {
    "zh-CN": "订阅取消",
    en: "Subscription canceled",
  },
};

const PURCHASE_TYPE_LABELS: Record<
  "subscription" | "creditPack" | "oneTime",
  Record<NotificationLocale, string>
> = {
  subscription: { "zh-CN": "订阅计费", en: "Subscription" },
  creditPack: { "zh-CN": "积分购买", en: "Credit pack" },
  oneTime: { "zh-CN": "一次性购买", en: "One-time purchase" },
};

const RECIPIENT_FALLBACK: Record<NotificationLocale, string> = {
  "zh-CN": "商家",
  en: "merchant",
};

export function formatShopifyOrderDisplayId(gidOrId: string): string {
  const trimmed = gidOrId.trim();
  if (!trimmed) return "";

  const slash = trimmed.lastIndexOf("/");
  const tail = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const digits = tail.replace(/\D/g, "");
  if (!digits) return trimmed;

  return `# ${digits}`;
}

export function formatCreditAmount(value: string | number): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(value).trim();
  return n.toLocaleString("en-US");
}

export function formatUsdDisplay(amountUsd: string | number | undefined): string {
  if (amountUsd == null) return "";
  const raw = String(amountUsd).trim().replace(/^\$/, "").replace(/^USD\s*/i, "");
  if (!raw) return "";

  const n = Number(raw);
  if (!Number.isFinite(n)) return `$${raw}`;

  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBillingPeriod(
  params: BillingPeriodKind,
  locale: NotificationLocale,
): string {
  if (params.kind === "oneTime") {
    return locale === "en" ? "AppPurchaseOneTime" : "一次性购买";
  }

  const normalized = params.interval.trim().toUpperCase();
  if (!normalized) return "";

  if (normalized === "MONTHLY" || normalized === "EVERY_30_DAYS") {
    return locale === "en" ? "EVERY_30_DAYS" : "月付";
  }
  if (normalized === "ANNUAL" || normalized === "YEARLY") {
    return locale === "en" ? "ANNUAL" : "年付";
  }

  return params.interval.trim();
}

export function formatPurchaseType(
  type: "subscription" | "creditPack" | "oneTime" | undefined,
  locale: NotificationLocale,
): string {
  if (!type) return "";
  return PURCHASE_TYPE_LABELS[type][locale];
}

export function formatCreditReason(
  key: CreditReasonKey | undefined,
  locale: NotificationLocale,
): string {
  if (!key) return "";
  return CREDIT_REASON_LABELS[key][locale];
}

export function mapSessionLocaleToNotificationLocale(
  sessionLocale: string | null | undefined,
): NotificationLocale | null {
  const trimmed = sessionLocale?.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-")) {
    return "zh-CN";
  }
  return null;
}

export function resolveNotificationLocale(
  sessionLocale?: string | null,
): NotificationLocale {
  const fromSession = mapSessionLocaleToNotificationLocale(sessionLocale);
  if (fromSession) return fromSession;

  const fromEnv = process.env.NOTIFICATION_DEFAULT_LOCALE?.trim().toLowerCase();
  if (fromEnv === "en") return "en";
  if (fromEnv === "zh-cn" || fromEnv === "zh") return "zh-CN";

  return "zh-CN";
}

export function defaultRecipientFallback(locale: NotificationLocale): string {
  return RECIPIENT_FALLBACK[locale];
}

/** @deprecated Use formatBillingPeriod with locale instead. */
export function formatBillingIntervalLabel(
  interval: string | null | undefined,
): string {
  if (!interval) return "";
  return formatBillingPeriod(
    { kind: "subscription", interval },
    "zh-CN",
  );
}
