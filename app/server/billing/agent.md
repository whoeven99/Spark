# 计费模块约定

## 环境变量

| 变量 | 说明 |
|------|------|
| `BILLING_GATEWAY=noop` | 不调 Shopify Billing，本地直接生效（开发） |
| `BILLING_TEST=true` | Shopify 测试计费（开发店） |

## 表职责

| 表 | 职责 |
|----|------|
| `Account` | 当前 token 分池与 `usedTokens` |
| `AppSubscription` | **当前**生效的 Shopify 订阅（`@@unique([shop, appName])`） |
| `PlanCatalog` | 套餐/按量包/试用定义（种子见 `prisma/billing-plan-catalog-seed.sql`，由 `npm run turso:sync:*` 写入） |
| `AccountPeriodUsage` | 每个订阅周期结束时的用量归档 |
| `BillingLog` | 试用、开通、续费、按量购等流水 |

## 续费时的顺序

1. 读取 `Account` + `AppSubscription`
2. `AccountPeriodUsage.create`（归档即将结束的周期）
3. `BillingLog` → `SUBSCRIPTION_RENEWED`
4. `AppSubscription.update`（新周期）
5. `Account.update`：`usedTokens = 0`，`subscriptionTokens = tokensPerPeriod`

## BillingLog 事件

| eventType | 含义 |
|-----------|------|
| `TRIAL_GRANTED` | 免费试用发放 |
| `SUBSCRIPTION_ACTIVATED` | 订阅确认生效 |
| `SUBSCRIPTION_RENEWED` | 周期续费 |
| `TOKEN_PACK_INITIATED` | 按量购包待确认 |
| `TOKEN_PACK_PURCHASED` | 按量购包入账 |

## Webhook（卫星 App toml 已注册）

- `app_subscriptions/update` → `webhooks.app.subscriptions_update.tsx`
- `app/purchases_one_time/update` → `webhooks.app.purchases_one_time_update.tsx`

## 路由

- `/app/billing`：订阅 / 购包
- 生成描述 API / 页面：调用 `requireBillingAccess`

## 主 App

`BILLING_ENABLED_APPS` 仅含 `generate-description`；`chat` 不校验。

## Turso 同步

- 可用余额由应用层 `getAvailableTokens()` 计算（`subscription + purchased + trial`），**不要**在 Turso 上依赖 `Account.availableTokens` 生成列。
- 新增/变更计费表结构后执行：`npm run turso:sync:test` 或 `npm run turso:sync:prod`（会刷新 baseline 并写入 PlanCatalog 种子）。
