# Template variables

## Common variables

- `appName`: App display name.
- `brandName`: Brand or company display name.
- `appIconUrl`: Public app icon URL used in the email header and footer.
- `recipientName`: Merchant user first name from Session (`firstName`). Fallback: `商家` (zh-CN) or `merchant` (en).
- `supportEmail`: Support email address.
- `dashboardUrl`: App dashboard URL.
- `shopName`: Shopify Admin shop display name (`shop.name`), e.g. `rinleaf`.
- `shopDomain`: Shopify shop domain, e.g. `x0hgaj-gp.myshopify.com`.
- `occurredAtUtc`: Event time in UTC+0, for example `2026-05-28 02:00 UTC`.

## App lifecycle variables

- `installedAtUtc`: Installation time in UTC+0.
- `uninstalledAtUtc`: Uninstallation time in UTC+0.

## Purchase variables

- `purchaseType`: Localized purchase type (zh: 积分购买; en: Credit pack).
- `orderId`: Display order id, e.g. `# 2578481175` (from Shopify GID).
- `planName`: Plan, product, or credit package name.
- `amountUsd`: Formatted amount with `$` prefix only, e.g. `$9.99` (column label may still say Amount (USD)).
- `billingPeriod`: Localized billing period. One-time: zh `一次性购买` / en `AppPurchaseOneTime`.

## Subscription variables

- `previousPlanName`: Previous plan name.
- `currentPlanName`: Current plan name.
- `effectiveAtUtc`: Subscription effective time in UTC+0.
- `billingPeriod`: Localized interval. zh: `月付` / `年付`; en: `EVERY_30_DAYS` / `ANNUAL`.

## Task variables

- `taskName`: Task display name.
- `taskType`: Task category.
- `taskId`: Task identifier.
- `statusUrl`: Task detail URL.
- `startedAtUtc`: Task start time in UTC+0.
- `completedAtUtc`: Task completion time in UTC+0.
- `pausedAtUtc`: Task pause time in UTC+0.
- `failureReason`: Failure reason.

## Credit account variables

- `creditsChanged`: Credit delta with en-US thousand separators, e.g. `1,000`.
- `creditsBefore`: Balance before (formatted, no unit suffix).
- `creditsAfter`: Balance after (formatted, no unit suffix).
- `creditUnit`: Always empty in billing emails.
- `creditReason`: Localized reason (no `credits` suffix).
