# 计费模块约定

改动本目录、`app/server/tokenUsage/`、计费路由或 Webhook 前请先读本文档；仓库总览见 `docs/PROJECT_CONTEXT.md` 第 5 节。

## 模块入口（按职责）

| 路径 | 职责 |
|------|------|
| `index.server.ts` | 对外导出（context、checkout、webhook、gateway） |
| `billingContext.server.ts` | 加载账户/订阅快照；首次访问可 `grantProductTrialIfEligible` |
| `requireBilling.server.ts` | `requireBillingAccess`、`billingErrorToResponse` |
| `billingActions.server.ts` | 订阅 / 按量包结账（返回 Shopify `confirmationUrl`） |
| `gateway/` | `getBillingGateway`：Shopify GraphQL 或 `noop` |
| `subscription/` | 开通、续费、`app_subscriptions/update` webhook |
| `purchase/` | 按量购包、`purchases_one_time/update` webhook |
| `account/` | `ensureAccount`、`grantTrial` |
| `plans/planCatalog.server.ts` | 读 `PlanCatalog` |
| `../tokenUsage/` | 周期内仅累加 `usedTokens`（`recordTokenUsage`）；计费前按 Turso `TokenBillingRule` 乘数（见 `docs/token-billing-rules.md`）经 `recordBilledTokenUsage` / `recordVisualToolTokenUsage`；续费时结算按量包剩余见 `tokenPools.server.ts`；余额见 `getAvailableTokens` / `hasTokenQuota` |

## 环境变量

| 变量 | 说明 |
|------|------|
| `BILLING_GATEWAY=noop` | 不调 Shopify Billing，本地直接生效（开发） |
| `BILLING_TEST=true` | Shopify 测试计费（开发店）；Render 等 `NODE_ENV=prod` 时必须显式设置 |

## Shopify returnUrl

- Billing GraphQL 的 `returnUrl` **最多 255 字符**。
- `buildBillingReturnUrl` 指向 **`/app/billing`**（订阅与按量购包共用），origin 优先用 `SHOPIFY_APP_URL`；query 带 `shop` + `host` + `embedded=1` + `billing_return=1`，**勿**复制 `id_token`。若请求无 `host`，用 `buildShopifyAdminHostParam(shop)` 推导，避免批准后落到登录页。
- 跳转 Shopify 结账页须用 `authenticate.admin` 返回的 `redirect(url, { target: "_top" })`（嵌入式 exit iframe），勿直接用 React Router `redirect`。
- 若 Shopify 将商户落到站点根路径 `/` 或 `/app`，`billing_return=1` 会由 `_index` / `app._index` 兜底重定向到计费页，避免回到 `APP_ENTRY` 默认首页。

## 表职责

| 表 | 职责 |
|----|------|
| `Account` | 当前 token 分池与 `usedTokens` |
| `AppSubscription` | **当前**生效的 Shopify 订阅（`@@unique([shop, appName])`）；取消 / 过期时**删除行** |
| `PlanCatalog` | 套餐/按量包/试用定义（种子见 `prisma/billing-plan-catalog-seed.sql`，由 `npm run turso:migrate:*` 写入） |
| `AccountPeriodUsage` | 每个订阅周期结束时的用量归档 |
| `BillingLog` | 试用、开通、续费、按量购等流水 |

## 续费时的顺序

1. 读取 `Account` + `AppSubscription`
2. `AccountPeriodUsage.create`（归档即将结束的周期）
3. `BillingLog` → `SUBSCRIPTION_RENEWED`
4. `AppSubscription.update`（新周期）
5. `Account.update`：`usedTokens = 0`，`subscriptionTokens = tokensPerPeriod`；`purchasedTokens` / `trialTokens` 按本周期 `usedTokens` 结算为真实剩余（`settlePoolsAtRenewal`，仅当 `usedTokens ≤` 三池之和时结算，见 `tokenPools.server.ts`）（**仅续费**；开通/升级/换套餐不清零 `usedTokens`，见 `activateSubscription.server.ts`）

## Token 续费结算顺序

1. 周期内：`recordTokenUsage` 只累加 `usedTokens`，**不**改 `subscriptionTokens` / `purchasedTokens` / `trialTokens`
2. 续费时：`trialTokens` → `subscriptionTokens` → `purchasedTokens` 扣减本周期 `usedTokens`，写入真实剩余后刷新订阅池

## BillingLog 事件

| eventType | 含义 |
|-----------|------|
| `TRIAL_GRANTED` | 免费试用发放 |
| `SUBSCRIPTION_ACTIVATED` | 订阅确认生效 |
| `SUBSCRIPTION_RENEWED` | 周期续费 |
| `SUBSCRIPTION_CANCELLED` | 取消订阅（写流水；删除 `AppSubscription`；`subscriptionTokens` 扣减该套餐 `tokensPerPeriod`，`trialTokens` 不动） |

## 测试环境取消按钮

- 计费页「取消订阅」：`isBillingDevCancelEnabled()` 为 true 时展示（`BILLING_TEST=true`、`NODE_ENV=test`、或非 `prod`）；可用 `BILLING_DEV_CANCEL=false` 强制关闭。
- 还需 Turso 中存在 `ACTIVE` / `PENDING` 的 `AppSubscription` 行。
- 调用 `appSubscriptionCancel`（`BILLING_GATEWAY=noop` 时仅同步本地）。见 `cancelActiveSubscription.server.ts`。
| `TOKEN_PACK_INITIATED` | 按量购包待确认 |
| `TOKEN_PACK_PURCHASED` | 按量购包入账 |

## Webhook（卫星 App toml 已注册）

- `app_subscriptions/update` → `webhooks.app.subscriptions_update.tsx`
- `app_purchases_one_time/update` → `webhooks.app.purchases_one_time_update.tsx`
- `app/uninstalled` → `webhooks.app.uninstalled.tsx`（`CommonEventLog`）
- `app/scopes_update` → `webhooks.app.scopes_update.tsx`（`CommonEventLog`）
- **安装**：无 `app/installed` webhook；OAuth / 进入 `/app` 时 `recordAppInstalled` 写入（`auth.$.tsx`、`app.tsx`）。幂等按「最近安装是否晚于最近卸载」，**勿**用 `session:offline_${shop}` 作 referenceId（重装后 session id 不变会误跳过）

## CommonEventLog（与 BillingLog 分表）

| eventType | 含义 |
|-----------|------|
| `APP_INSTALLED` | OAuth 完成，获得 session |
| `APP_UNINSTALLED` | 卸载 |
| `SCOPES_UPDATE` | 授权 scope 变更 |

计费流水仍在 `BillingLog`，勿合并改名。

## 路由

- `/app/billing`：计费与订阅独立页（`BillingPage`）；`generate-description` App 侧栏含「计费与订阅」入口
- 生成描述 API / 页面：调用 `requireBillingAccess`

## 主 App

`BILLING_ENABLED_APPS` 仅含 `generate-description`；`chat` 不校验。

## Turso 迁移（首选）

- 可用余额由应用层 `getAvailableTokens()` 计算（`subscription + purchased + trial`），**不要**在 Turso 上依赖 `Account.availableTokens` 生成列。
- **日常**：`npm run turso:migrate:test` / `turso:migrate:prod`（维护 `_prisma_migrations`，只跑未应用的 `prisma/migrations/*/migration.sql`）。
- 详情见 `docs/PROJECT_CONTEXT.md`「Turso 数据库」一节。

## CommonEventLog 无数据时排查

1. Render / 本地是否设置 `APP_ENTRY=generate-description`（未设则 `appName` 会写成 `chat`）。
2. 代码是否已部署（含 `app/routes/webhooks.app.uninstalled.tsx` 等）。
3. 卫星 App 需单独执行 `shopify app deploy -c shopify.app.smart-description.toml`（CI 默认只 deploy `shopify.app.test.toml`）。
4. Turso 是否有 `CommonEventLog` 表：`npm run turso:migrate:test`。
5. Render 日志搜 `[CommonEvent]`。
