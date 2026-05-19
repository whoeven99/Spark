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
| `../tokenUsage/` | AI 调用后累加 `usedTokens`（`recordTokenUsage`）；余额见 `accountBalance.server.ts` 的 `getAvailableTokens` / `hasTokenQuota` |

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
| `PlanCatalog` | 套餐/按量包/试用定义（种子见 `prisma/billing-plan-catalog-seed.sql`，由 `npm run turso:migrate:*` 写入） |
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
- `app_purchases_one_time/update` → `webhooks.app.purchases_one_time_update.tsx`
- `app/uninstalled` → `webhooks.app.uninstalled.tsx`（`CommonEventLog`）
- `app/scopes_update` → `webhooks.app.scopes_update.tsx`（`CommonEventLog`）
- **安装**：无 `app/installed` webhook；OAuth / 进入 `/app` 时 `recordAppInstalled` 写入（`auth.$.tsx`、`app.tsx`）。幂等按「最近安装是否晚于最近卸载」，**勿**用 `session:offline_${shop}` 作 referenceId（重装后 session id 不变会误跳过）

## CommonEventLog（与 BillingLog 分表）

| eventType | 含义 |
|-----------|------|
| `APP_INSTALLED` | OAuth 完成，获得 session |
| `APP_UNINSTALLED` | 卸载；`metadata.uninstallReason` / `uninstallDescription` 存商户填写的卸载原因（见下） |
| `SCOPES_UPDATE` | 授权 scope 变更 |

### 卸载原因（APP_UNINSTALLED）

- Shopify `app/uninstalled` **HTTP body 多为店铺信息**，卸载原因通常在 Partner API 的 `RelationshipUninstalled`（`reason`、`description`）。
- 写入顺序：先解析 webhook `payload` / 请求头 → 若为空且已配置 Partner API，再拉取最近一条卸载事件。
- 查询：`SELECT shop, metadata FROM CommonEventLog WHERE eventType = 'APP_UNINSTALLED'`（`metadata` 为 JSON：`uninstallReason`、`uninstallDescription`、`uninstallFeedbackSource`）。
- **可选环境变量**（Render / `.env`）：
  - `SHOPIFY_PARTNER_ORG_ID`：Partner 组织 ID（Dashboard URL 中）
  - `SHOPIFY_PARTNER_APP_GID`：如 `gid://partners/App/...`
  - `SHOPIFY_PARTNER_API_TOKEN` 或 `SHOPIFY_CLI_PARTNERS_TOKEN`
  - `SHOPIFY_PARTNER_API_VERSION`（默认 `2025-07`）

计费流水仍在 `BillingLog`，勿合并改名。

## 路由

- `/app/billing`：计费与订阅独立页（`BillingPage`）；`generate-description` App 侧栏含「计费与订阅」入口
- 生成描述 API / 页面：调用 `requireBillingAccess`

## 主 App

`BILLING_ENABLED_APPS` 仅含 `generate-description`；`chat` 不校验。

## Turso 迁移（首选）

- 可用余额由应用层 `getAvailableTokens()` 计算（`subscription + purchased + trial`），**不要**在 Turso 上依赖 `Account.availableTokens` 生成列。
- **日常**：`npm run turso:migrate:test` / `turso:migrate:prod`（维护 `_prisma_migrations`，只跑未应用的 `prisma/migrations/*/migration.sql`）。
- **曾仅用 `turso:sync` 建库**：先执行一次 `npm run turso:migrate:test -- --baseline`（只标记、不执行 SQL），之后再 `turso:migrate`。
- **空库兜底**：`npm run turso:sync:*`（全量 baseline，`CREATE IF NOT EXISTS`，**不会** ALTER 已有表）。
- 详情见 `docs/PROJECT_CONTEXT.md`「Turso 数据库」一节。

## CommonEventLog 无数据时排查

1. Render / 本地是否设置 `APP_ENTRY=generate-description`（未设则 `appName` 会写成 `chat`）。
2. 代码是否已部署（含 `app/routes/webhooks.app.uninstalled.tsx` 等）。
3. 卫星 App 需单独执行 `shopify app deploy -c shopify.app.smart-description.toml`（CI 默认只 deploy `shopify.app.test.toml`）。
4. Turso 是否有 `CommonEventLog` 表：`npm run turso:migrate:test`（勿对缺表库只做 `--baseline`）。
5. Render 日志搜 `[CommonEvent]`。
