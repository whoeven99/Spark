# 计费模块约定

改动本目录、`app/server/tokenUsage/`、计费路由或 Webhook 前请先读本文档；仓库总览见 `docs/PROJECT_CONTEXT.md` 第 5 节。

## 模块入口（按职责）

| 路径 | 职责 |
|------|------|
| `index.server.ts` | 对外导出（context、checkout、webhook、gateway） |
| `billingContext.server.ts` | 加载账户/订阅快照 |
| `requireBilling.server.ts` | `requireBillingAccess`、`billingErrorToResponse` |
| `billingActions.server.ts` | 订阅 / 按量包结账 / 提高超额封顶（返回 Shopify `confirmationUrl`） |
| `gateway/` | `getBillingGateway`：Shopify GraphQL 或 `noop`（含 usage record、改 cap） |
| `overage/` | 超额数学、门禁 `computeAccess`、批量 `flushOveragePending` |
| `subscription/` | 开通、续费、`app_subscriptions/update` webhook |
| `purchase/` | 按量购包（售卖已下线，入账兼容保留）、`purchases_one_time/update` webhook |
| `account/` | `ensureAccount` |
| `plans/planCatalog.server.ts` | 读 `PlanCatalog`（含超额单价 / 默认封顶） |
| `../tokenUsage/` | 周期内仅累加 `usedTokens`（`recordTokenUsage` 底层）；**业务扣费统一走** `recordBilledTokenUsage(s)` / `recordChatTokenUsage` / `recordVisualToolTokenUsage`；`recordBilled*` 之后会 `trackAndFlushOverage`；续费结算见 `tokenPools.server.ts`；含内余额见 `getAvailableTokens` / `hasTokenQuota` |
| `../aiTask/concurrencyLimiter.server.ts` | 进程内信号量：全局文生图 / 图翻 + **按店** `SHOP_AI_TASK_CONCURRENCY`（默认 2）；异步任务经 `runQueuedShopAiTask` 排队，开跑前复核额度，不足则 fail 并停烧 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `BILLING_GATEWAY=noop` | 不调 Shopify Billing，本地直接生效（开发） |
| `BILLING_TEST=true` | Shopify 测试计费（开发店）；Render 等 `NODE_ENV=prod` 时必须显式设置 |

## Shopify returnUrl

- Billing GraphQL 的 `returnUrl` **最多 255 字符**。
- `buildBillingReturnUrl` 指向 **`/app/account`**（订阅与按量购包共用；一级「账户与订阅」），origin 优先用 `SHOPIFY_APP_URL`；query 带 `shop` + `host` + `embedded=1` + `billing_return=1`，**勿**复制 `id_token`。若请求无 `host`，用 `buildShopifyAdminHostParam(shop)` 推导，避免批准后落到登录页。
- 跳转 Shopify 结账页须用 `authenticate.admin` 返回的 `redirect(url, { target: "_top" })`（嵌入式 exit iframe），勿直接用 React Router `redirect`。
- 若 Shopify 将商户落到站点根路径 `/` 或 `/app`，`billing_return=1` 会由 `_index` / `app._index` 兜底重定向到计费页。
- `buildBillingReturnUrl` 对 `aiassistant-wi7b.onrender.com` / `shopify.app.test.toml` client_id 映射 Admin handle `aiassistant-test`；可通过 `SHOPIFY_ADMIN_APP_HANDLE` 覆盖。

## 表职责

| 表 | 职责 |
|----|------|
| `Account` | 当前 token 分池（`subscriptionTokens` + `purchasedTokens`）与 `usedTokens` |
| `AppSubscription` | **当前**生效的 Shopify 订阅（`@@unique([shop])`）；取消 / 过期时**删除行**；含 usage line / cappedAmount / pending overage；换套餐时主行保持 ACTIVE，新 checkout 写入 `pendingShopifySubscriptionId` / `pendingPlanKey` / `pendingConfirmationUrl` / `pendingCreatedAt` |
| `PlanCatalog` | 套餐/按量包定义（种子见 `prisma/billing-plan-catalog-seed.sql`）；订阅含 `overagePricePerThousand` / `defaultOverageCapAmount`；`ONE_TIME_PACK` 默认 `enabled=0`；无 Shopify 套餐试用天数 |
| `AccountPeriodUsage` | 每个订阅周期结束时的用量归档 |
| `BillingLog` | 试用、开通、续费、按量购等流水 |
| `OverageUsageCharge` | Shopify usage 超额扣费幂等流水（PENDING/POSTED/FAILED） |
| `ToolTokenUsageLog` | **统一**工具/聊天 token 消耗明细（`feature` × `modelKey`；含 chat / 文案 / 质量评分 / 文生图 / 图片翻译等） |

## 超额计费（Cursor 式）

- 新订阅 `appSubscriptionCreate` **同时**带 recurring + usage 行（默认封顶来自 PlanCatalog）。
- 含内额度（订阅+购包剩余）用完后，ACTIVE 可继续使用，按 `overagePricePerThousand` 累计，达阈值后 `appUsageRecordCreate`。
- 封顶用尽：`requireBillingAccess` 抛 `OVERAGE_CAP_REACHED`；`/chat-stream` SSE 提示去账户页提高上限。
- 提高上限：`appSubscriptionLineItemUpdate` → 商户批准 `confirmationUrl`；noop 本地直接生效。
- **当前产品**：无 Shopify 订阅试用期 / 无 `trialTokens` 三池；新客额度走账户页营销领 Token（`SPARK_PROMO_*`）。
- **Disabled（`overageSpendingEnabled=false`）**：本地关闭按需扣费（一分钱不扣），不降低 Shopify `cappedAmount`；含内用尽后按额度耗尽拦截。UI：固定金额 / 禁用。
- **本地上限 `overageSpendLimit`**：门禁与展示用 `min(spendLimit, Shopify cappedAmount)`。下调或不超过 Shopify 授权 → 只改本地；超过授权 → `appSubscriptionLineItemUpdate` 需 Shopify 确认。
- 老订阅无 `usageLineItemId`：`overageEnabled=false`，用尽即拦，须重新批准含 usage 的订阅。
- 计费页下线购包售卖；已入账 `purchasedTokens` 仍可扣。

## Token 消耗记账约定（强制）

凡消耗 LLM / 视觉模型 token 的路径，成功后必须记入同一处：

1. `Account.usedTokens`（用户账户额度）
2. `ToolTokenUsageLog`（明细；账户页「工具用量」读取）

统一入口：`recordBilledTokenUsage` / `recordBilledTokenUsages`（聊天可用 `recordChatTokenUsage`，视觉定额可用 `recordVisualToolTokenUsage`）。**禁止**业务侧直接调 `recordTokenUsage`（除非底层实现）。

| feature | 能力 | 门禁 | 记账入口示例 |
|---------|------|------|----------------|
| `chat` | Ask 聊天主 Agent、卡片补全 LLM、fallback、上下文摘要 | `/chat-stream` → `requireBillingAccess`；会话标题 LLM 亦先查额度，不足则截断回退不调模型 | `recordChatTokenUsage` |
| `product_copy` | 商品文案生成/润色 | Studio / HTTP / 批量 | `recordBilledTokenUsage` |
| `product_quality` | 质量评分（文案 LLM + Vision） | `/api/product-quality-score` | `recordBilledTokenUsages` |
| `image_prompt` | 画面提示词扩写 | 视觉工具门禁 | `recordVisualToolTokenUsage` |
| `image_generate` | 文生图（定额） | 视觉工具门禁 | `recordVisualToolTokenUsage` |
| `picture_translate` | 图片翻译（定额） | 视觉工具门禁 | `recordVisualToolTokenUsage` |

新增消耗点时：先加 `TOKEN_BILLING_FEATURES` + seed 规则，再接线门禁与 `recordBilled*`。

## 续费时的顺序

1. 读取 `Account` + `AppSubscription`
2. `AccountPeriodUsage.create`（归档即将结束的周期）
3. `BillingLog` → `SUBSCRIPTION_RENEWED`
4. `AppSubscription.update`（新周期）
5. `Account.update`：`usedTokens = 0`，`subscriptionTokens = tokensPerPeriod`；`purchasedTokens` 按本周期 `usedTokens` 结算为真实剩余（`settlePoolsAtRenewal`，仅当 `usedTokens ≤` 双池之和时结算，见 `tokenPools.server.ts`）（**仅续费**；开通/升级/换套餐不清零 `usedTokens`，见 `activateSubscription.server.ts`）

## Token 续费结算顺序

1. 周期内：`recordTokenUsage` 只累加 `usedTokens`，**不**改 `subscriptionTokens` / `purchasedTokens`
2. 续费时：`subscriptionTokens` → `purchasedTokens` 扣减本周期 `usedTokens`，写入真实剩余后刷新订阅池

## BillingLog 事件

| eventType | 含义 |
|-----------|------|
| `TRIAL_GRANTED` | 历史：免费试用发放（保留事件名；新路径不再发放 trialTokens） |
| `SUBSCRIPTION_ACTIVATED` | 订阅确认生效 |
| `SUBSCRIPTION_RENEWED` | 周期续费 |
| `SUBSCRIPTION_CANCELLED` | 取消订阅（写流水；删除 `AppSubscription`；`subscriptionTokens` 扣减该套餐 `tokensPerPeriod`，`purchasedTokens` 不动） |
| `TOKEN_PACK_INITIATED` | 按量购包待确认（售卖已下线，兼容旧路径） |
| `TOKEN_PACK_PURCHASED` | 按量购包入账 |
| `PROMO_TOKEN_CLAIMED` | 营销活动领取 Token（`referenceId` = campaignId；入账 `purchasedTokens`） |
| `SYSTEM_REWARD` | Admin 系统奖励 / 手动调整按量池（入账 `purchasedTokens`；metadata 含操作者与备注） |

## 营销领 Token（账户页）

- 配置：`app/server/billing/promo/promoCampaign.server.ts`（环境变量可覆盖）。
- 默认活动：`install-welcome-1m`，安装后自动发放 **1000000** Token（`ensureInstallPromoTokens`）；每店每活动一次。
- 防薅：`PromoClaimLedger` 存 `sha256(shop)` + `campaignId`（卸载 / `shop/redact` **不删**）；店内仍写 `BillingLog`/`Account` 便于当期审计（卸载时随店清掉）。
- 触发：`app/routes/app.tsx` 壳层 loader **await** 自动领取；`requireBillingAccess` 再兜底一次。账户页只展示「已自动发放」，不再需要手动领取按钮。
- 卸载清理：`app/uninstalled` **await** `archiveAndPurgeShopData`（归档有超时，超时仍清库）→ 店数据进 Blob `shop-archives` 后删 Turso（含 `Account`/`CommonEventLog`/Session 等）；仅保留 `PromoClaimLedger`。
- 环境变量：`SPARK_PROMO_ENABLED`（默认开，`false` 关闭）、`SPARK_PROMO_CAMPAIGN_ID`、`SPARK_PROMO_TOKEN_AMOUNT`、`SPARK_PROMO_STARTS_AT` / `SPARK_PROMO_ENDS_AT`（ISO；可选）。
- 换活动：改 `SPARK_PROMO_CAMPAIGN_ID`（新 id 可再领一次）并按需改额度/文案（i18n `billing.promo*`）。
- Admin：`/credits` 可查双池并手动调整 `purchasedTokens`（同样写 `SYSTEM_REWARD`）；`/billing` 为 BillingLog 总览。

门禁错误码（非 BillingLog）：`QUOTA_EXHAUSTED` / `OVERAGE_CAP_REACHED` → `BillingAccessDeniedError`；商户已鉴权业务路径经 `billingErrorToResponse` / `merchantFriendly*` 返回 **HTTP 200** + 自然语言（对话 SSE `type: error`），避免审核场景出现 402。

## 换套餐与 DECLINED

- **DECLINED ≠ CANCELLED**：`mapShopifySubscriptionStatus` 将 Shopify `DECLINED` 映射为独立状态 `DECLINED`，**不得**走 `markSubscriptionNonActive` 删行+扣 `subscriptionTokens`。
- **首次订阅 PENDING** 被拒：删除本地 PENDING 行，不扣额度。
- **换套餐**：`createSubscription` 在已有 ACTIVE 时**只写 pending\***，不把主行打成 PENDING、不覆盖 `shopifySubscriptionId`。
- **replacementBehavior**：新价 > 旧价 → `APPLY_IMMEDIATELY`；新价 ≤ 旧价 → `APPLY_ON_NEXT_BILLING_CYCLE`（`resolveReplacementBehavior`）。
- Webhook `ACTIVE` 且 id = pending GID：用 `pendingPlanKey` 激活并清空 pending。
- Webhook `CANCELLED`/`EXPIRED`：仅当 id **精确等于**当前主 `shopifySubscriptionId` 且**无** pending 时才真取消；pending 槽上的终态按拒绝清 pending。
- `reconcilePendingSubscriptions`：同时核对 pending 槽与首次 PENDING；支持 ACTIVE 补激活与 DECLINED/EXPIRED 清理。
- 账户页：有 pending 时展示 banner（继续确认 / 放弃）；回跳 toast 区分「待确认」与「已拒绝未改套餐」。

## 测试环境取消按钮

- 计费页「取消订阅」：`isBillingDevCancelEnabled()` 为 true 时展示（`BILLING_TEST=true`、`NODE_ENV=test`、或非 `prod`）；可用 `BILLING_DEV_CANCEL=false` 强制关闭。
- 还需 Turso 中存在 `ACTIVE` / `PENDING` 的 `AppSubscription` 行。
- 调用 `appSubscriptionCancel`（`BILLING_GATEWAY=noop` 时仅同步本地）。见 `cancelActiveSubscription.server.ts`。

## Webhook（`shopify.app.test.toml` 已注册）

- `app_subscriptions/update` → `webhooks.app.subscriptions_update.tsx`
- 订阅批准后若 webhook 未到，计费页 loader 会 `reconcilePendingSubscriptions`（Admin API 核对 pending 换套餐 / 首次 PENDING → ACTIVE，或 DECLINED 清槽；与购包 `reconcilePendingTokenPackPurchases` 同理）
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

- `/app/account`：计费与订阅页（`BillingPage`）；一级导航「账户与订阅」。旧路径 `/app/settings/billing` 重定向至此。
- 页面必须直接渲染 `PlanCatalog` 的价格、积分和 `planKey`，走 Shopify Billing 结账。禁止前端覆盖价、伪造套餐或 `_mock` 禁用结账。
- `/app/studio/copy` 与 `/api/product-improve`：商品文案优化调用 `requireBillingAccess`。

## 启用开关

`BILLING_ENABLED=false` 时关闭订阅校验与运营飞书通知；默认启用。

## Turso 迁移（首选）

- 可用余额由应用层 `getAvailableTokens()` 计算（`subscription + purchased`），**不要**在 Turso 上依赖 `Account.availableTokens` 生成列。
- **日常**：`npm run turso:migrate:test` / `turso:migrate:prod`（维护 `_prisma_migrations`，只跑未应用的 `prisma/migrations/*/migration.sql`）。
- 详情见 `docs/PROJECT_CONTEXT.md`「Turso 数据库」一节。

## CommonEventLog 无数据时排查

1. 代码是否已部署到 `aiassistant-wi7b.onrender.com`（含 `app/routes/webhooks.app.uninstalled.tsx` 等）。
2. Shopify 配置是否已发布：`shopify app deploy -c shopify.app.test.toml`。
3. Turso 是否有 `CommonEventLog` 表：`npm run turso:migrate:test`。
4. Render 日志搜 `[CommonEvent]`。
