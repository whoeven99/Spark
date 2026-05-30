# Template variables

## Common variables

- `appName`: App display name.
- `brandName`: Brand or company display name.
- `appIconUrl`: Public app icon URL used in the email header and footer.
- `recipientName`: Recipient display name. Use a fallback value such as "商家" or "merchant" if no name is available.
- `supportEmail`: Support email address.
- `dashboardUrl`: App dashboard URL.
- `shopName`: Shopify shop name.
- `shopDomain`: Shopify shop domain.
- `occurredAtUtc`: Event time in UTC+0, for example `2026-05-28 02:00 UTC`.

## App lifecycle variables

- `installedAtUtc`: Installation time in UTC+0.
- `uninstalledAtUtc`: Uninstallation time in UTC+0.

## Purchase variables

- `purchaseType`: Purchase type, such as subscription, credit purchase, or one-time purchase.
- `orderId`: Payment or order identifier.
- `planName`: Plan, product, or credit package name.
- `amountUsd`: Payment amount normalized to USD, for example `12.00`.
- `billingPeriod`: Billing period.

## Subscription variables

- `previousPlanName`: Previous plan name.
- `currentPlanName`: Current plan name.
- `effectiveAtUtc`: Subscription effective time in UTC+0.
- `billingPeriod`: Billing period.

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

- `creditsChanged`: Credit amount changed by this event.
- `creditsBefore`: Credit balance before this event.
- `creditsAfter`: Credit balance after this event.
- `creditUnit`: Credit unit, such as credits.
- `creditReason`: Reason for the credit change.
