# Template variables

## Common variables

- `shop_id`: Shopify store identifier interpolated into the fixed app link `https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email`.
- `path`: Shopify app path segment interpolated into the fixed app link `https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email`.
- `appName`: App display name.
- `brandName`: Brand or company display name.
- `appIconUrl`: Public app icon URL used in the email header and footer.
- `recipientName`: Recipient display name. Use a fallback value such as "商家" or "merchant" if no name is available.
- `supportEmail`: Support email address.
- `dashboardUrl`: App dashboard URL.
- `shopName`: Shopify shop name.
- `shopDomain`: Shopify shop domain, e.g. `demo.myshopify.com`.
- `occurredAtUtc`: Event time in UTC+0, for example `2026-05-28 02:00 UTC`.

## App lifecycle variables

- `installedAtUtc`: Installation time in UTC+0.
- `uninstalledAtUtc`: Uninstallation time in UTC+0.

## Purchase variables

- `purchaseType`: Localized purchase type, such as zh `积分购买` or en `Credit pack`.
- `orderId`: Payment or order identifier.
- `planName`: Plan, product, or credit package name.
- `amountUsd`: Formatted amount with `$` prefix only, for example `$9.99`.
- `billingPeriod`: Localized billing period.

## Subscription variables

- `previousPlanName`: Previous plan name.
- `currentPlanName`: Current plan name.
- `effectiveAtUtc`: Subscription effective time in UTC+0.
- `billingPeriod`: Billing period.

## Task variables

- `taskName`: Task display name.
- `taskId`: Task identifier.
- `startedAtUtc`: Task start time in UTC+0. Falls back to `occurredAtUtc` when not provided.
- `completedAtUtc`: Task completion time in UTC+0. Falls back to `occurredAtUtc` when not provided.
- `pausedAtUtc`: Task pause time in UTC+0. Falls back to `occurredAtUtc` when not provided.
- `failureReason`: Failure reason.

## Credit account variables

- `creditsChanged`: Credit amount changed by this event.
- `creditsBefore`: Credit balance before this event.
- `creditsAfter`: Credit balance after this event.
- `creditUnit`: Empty string in current billing emails.
- `creditReason`: Localized reason for the credit change.
