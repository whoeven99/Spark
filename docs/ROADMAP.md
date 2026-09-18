# Spark — Product Roadmap

> 对照当前代码更新（2026-09-18）。若本文档与代码冲突，以代码、`prisma/schema.prisma`、`AGENTS.md` 为准。
> 原则：先稳住「安装 → 有数据 → 对话能问/能看/能计费」→ 补齐上架材料 → 再做告警闭环、归因加深与统一写回治理。

---

## 一、当前状态

| 能力 | 状态 | 说明 |
|------|------|------|
| LangGraph ReAct Agent / Ask 工作台 | ✅ 已上线 | `/app`（旧 `/app/assistant`、`/app/home-v2` 重定向至此）；上下文：商品 / 订单 / 文章 / 文件 |
| 信息架构 | ✅ 已上线 | **prod 导航只留** Tasks + Account（对话优先）；测/本地另有 Home v1 / Today / Health Monitor / Studio / Ads / Settings。`/app/create`、`/app/ads` 等 URL 可直达 |
| 商品文案 / 质量评分 / 写回 Shopify | ✅ 已上线 | Studio Copy；写回走现有商品更新 API，尚无统一 `writeBack/` 治理层 |
| 图片翻译 / 图片生成 | ✅ 已上线 | Studio Image |
| 创作页能力目录 | 🟡 部分落地 | `/app/create`：`ready` 3（文案/生图/图翻）+ `chat` 4（SEO / 批量打标·上下架·调价）；`inventory` 等 10 个 domain 仍空，无 `planned` 条目 |
| 订单 / 退款 / 客户 / 库存 / 履约镜像 | ✅ 代码已落地 | `ShopOrder*` 等 + `app/server/shopify/sync/` + webhook 路由 |
| Webhook 订阅（toml） | ✅ test/prod 已写入并曾 deploy | 见下方「数据地基」；**改 toml 后仍须对该配置重新 `shopify app deploy`** |
| 历史回补 | ✅ 已接线 | 手动：`/app/settings/data`；安装/进 `/app`：`ensureInstallOrderBackfill`（默认 `SPARK_ORDER_BACKFILL_DAYS=30`） |
| 经营体检 / Today / Health Monitor / Tasks | ✅ 已上线 | 快照走 `ensureDailySnapshotOverview` / `ensureDailySnapshot`；prod 不进一级导航 |
| Playbook（只读） | ⏸️ 已注册但未对商户开启 | `shopHealthCheck`、`productLaunchPipeline`、`inventoryRiskMitigation`、`refundIssueReview`；`PLAYBOOKS_ENABLED=false`，输入区快捷条已移除 |
| 指标计算器 | ✅ 已有基础 | `app/server/ai/semantics/metricsCalculator.server.ts`；尚未成为所有 Skills 的唯一口径源 |
| Shopify 订阅 + Credit | ✅ 已上线 | `BILLING_GATEWAY` / `BILLING_TEST`（另有 `BILLING_ENABLED`、`BILLING_DEV_CANCEL`） |
| 广告 Catalog / Insights / Pixel | 🟡 Catalog/Insights 已上线；Pixel 审核期关闭 | Meta / Google / TikTok；扩展为 `shopify.extension.toml.off`，过审后还原 |
| 广告归因 | 🟡 部分 | 订单 UTM / 来源 last-click 与渠道 ROI 已有；**点击 ID（gclid/fbclid/ttclid）↔ 订单 join 未做** |
| Admin 运营后台 | ✅ 已上线 | 独立 `admin/` |
| 卸载清数 / GDPR 擦除 | ✅ 已落地 | `archiveAndPurgeShopData`；保留 `PromoClaimLedger` / `ReferralClaim` / `ReferralInstall` |
| 隐私政策页 | ⬜ 仍缺 | Listing + 应用内 URL 均无；上架前必须补 |
| TSF 整店翻译执行 | 🚫 不在本仓库 | Admin 只读观测；不要当成本应用能力 |

**当前发布姿态**：已对商家开放安装。生产 `shopify.app.prod.toml` → Render `Spark-Prod`；测环境 `shopify.app.test.toml` → Render Test。CI 可发 Spark Test / Spark Prod / Admin。

**仍卡住的真实缺口**（不是远期畅想）：

1. **隐私政策页 / Listing URL** 仍缺（须披露安装福利防滥用的 shop 域名哈希账本）。
2. **Partner 分发方式**须选定（选定后不可改）；PCD、Listing 素材、测试说明与凭据未齐。
3. **独立告警中心**未建（无 `app/server/ai/skills/alerts/`）；缺货 / 超卖 / SLA / 退款率 → Chat + 飞书未闭环。
4. **Playbook** 代码在、商户侧关闭；恢复前需产品确认并改 `PLAYBOOKS_ENABLED`。
5. **物流凭证**写在进程本地 JSON（`.data/logistics-provider-credentials.json`），Render 重启即丢；不要当生产核心路径。
6. **统一写回治理层** `app/server/ai/writeBack/` 不存在；各 bulk/import 分治 dry-run → apply。
7. Web Pixel / Theme 扩展仍为 **`.toml.off`**（审核期有意关闭）；过审后按清单还原。

---

## 二、整体目标架构

```
┌─────────────────────────────────────────────────────────┐
│ 入口：prod = /app 对话 + Tasks + Account                │
│       测/本地 = 同上 + Today / HM / Studio / Ads / Settings │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ Skills（对话 / 任务卡）± Playbook（当前关闭）              │
│ 经营诊断  商品优化  批量编辑  导入导出  图片  广告（已有）  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ Turso 业务镜像 · Cosmos 运行摘要 · Blob · SLS              │
│ Shopify Webhook 增量 + GraphQL 回补                       │
└─────────────────────────────────────────────────────────┘
```

---

## 三、路线图

### Phase 0 — 数据地基（✅ 主体完成）

| 任务 | 状态 | 落点 |
|------|------|------|
| Prisma：`ShopOrder` / `ShopRefund` / `ShopCustomer` / `ShopInventoryLevel` / `ShopFulfillment` / `ShopSyncCheckpoint` | ✅ | `prisma/schema.prisma` |
| 同步 service | ✅ | `app/server/shopify/sync/` |
| Webhook 路由 | ✅ | `webhooks.orders.paid` 等 |
| toml 订阅 + deploy | ✅ | test：含库存；prod：**不订** `inventory_levels/update`（第一版不做库存镜像）。2026-08-28 test 曾发 `aiassistant-test-119` |
| 手动回补 UI | ✅ | `/app/settings/data` |
| 安装后自动回补 | ✅ | `ensureInstallOrderBackfill`（`app.tsx` loader 调用） |
| `MetricsCalculator` | ✅ 基础版 | 尚未成为所有 Skills 的唯一口径源 |

### Phase 1 — 只读闭环（✅ 主体上线；告警 / Playbook 商户侧未齐）

| 能力 | 状态 |
|------|------|
| Today / Health Monitor / Tasks | ✅（prod 仅 Tasks 进导航） |
| 四个只读 Playbook 注册 | ⏸️ `PLAYBOOKS_ENABLED=false` |
| 首页经营摘要 + 推荐操作 | ✅ 对话工作台推荐组（非 Playbook 快捷条） |
| 独立告警中心 | ⬜ 未建 `skills/alerts/` |
| case 采纳 + 7/14/30 天复盘卡 | ⬜ `agentRunLog` / playbookCase 有落库骨架，闭环未完成 |

`app.today.diagnosis.tsx` 只做兼容跳转，不要再当正式诊断页升级。

### Phase 2 — 受控写回（未统一；能力已散落）

商品文案写回、批量调价/打标/上下架、商品导入 apply **已存在**，但是分模块四层（纯算 → reader → dry-run → apply），**没有** `app/server/ai/writeBack/` 统一网关。

本阶段目标：

- 写回网关：`dry_run`、`idempotency_key`、审计、回滚快照
- 继续收口商品内容 / 上下架
- 促销（`write_discounts`，需新 scope）— 未做
- 客户分群 + 营销推送 — 未做

### Phase 3 — 跨渠道扩展（部分已落地）

| 任务 | 状态 |
|------|------|
| 广告凭证 + 目录同步 + 结构洞察 | ✅ |
| UTM / 来源渠道归因 | ✅ 粗粒度 |
| 点击 ID ↔ 站内订单 | ⬜ |
| 预算 pacing 告警、广告写回 | ⬜ |
| GA4 / GSC / PageSpeed / ShopifyQL | ✅ Settings 已有 |
| 落地页漏斗（Pixel + landingSite） | 🟡 Today 第一版；Pixel 扩展审核期关闭 |
| 履约承运商 API / WMS | ⬜；本地 JSON 凭证不适合生产 |
| 竞品监控 | ⬜ |

### Phase 4 — 多模态增强（按需，不挡主路径）

窄场景、可复核：商品图质检、素材归类、竞品截图解析。核心诊断仍以结构化数据为主。

---

## 四、优先级

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 隐私政策页 + Listing URL | P0 | 公开上架硬门禁 |
| Partner 分发方式选定 + PCD / Listing / 测试凭据 | P0 | **选定后不可改** |
| 生产计费开关核对 | P0 | 真店 `BILLING_GATEWAY`≠`noop`，勿开 `BILLING_TEST` |
| 1–2 家店冒烟：安装 → 回补 → 对话/Today → 订阅 → 卸载 | P0 | 验证清数与计费 |
| 过审后恢复 Pixel / Theme（按清单） | P1 | 现为有意 `.toml.off` |
| 独立告警中心 / case 复盘 | P1–P2 | 最贴合 prod 对话优先 |
| 恢复或删除商户侧 Playbook | P2 | 避免「注册了但永远 false」长期漂移 |
| 点击 ID 级广告归因 | P2 | 解锁更可信的投放 ROI |
| 统一 writeBack 治理 | P2+ | 主路径写回已可用，治理后置 |
| 风控链路、回收期/长期 ROI | 本周期不做 | 页面不展示；短期 ROI 等产品公式 |
| 促销写回 / 竞品 / WMS | P2+ | 主路径之后 |

---

## 五、实现规范

### 5.1 新增 Skill

```
app/server/ai/skills/{domain}/
├── {skillName}.ts
├── {skillName}.schema.ts
└── index.ts          # 注册到 globalToolRegistry
```

改工具时同时检查注册、schema、执行器、token 计费、任务卡片和测试。

### 5.2 新增 Playbook

```
app/server/ai/playbooks/{name}/
├── index.ts          # PlaybookDefinition（含 name）
└── ...
```

四个 Playbook 只经 `app/server/ai/playbooks/index.ts` 的 `registerPlaybook` 挂到 `globalPlaybookRegistry`。对商户开启前必须把 `PLAYBOOKS_ENABLED` 设为 `true`，并恢复前端入口（若需要）。

### 5.3 写回（统一治理层落地后强制）

- [ ] `dry_run` 默认开启
- [ ] `idempotency_key`
- [ ] 审计日志
- [ ] 回滚快照或强风控
- [ ] 默认人工确认（L2）

现状：各 bulk*/productImport 已有分模块 dry-run → pending_review → apply；Agent 回合内禁止直写。

### 5.4 Skill 版本化

`skill_id` + `version`；规则 / 提示词 / 阈值变更时递增。

### 5.5 创作页能力

只在 `app/lib/createCapabilities.ts` 登记；`planned` 不进目录。空 domain 可保留归属，但不要假装已上线。

---

## 六、里程碑

| 里程碑 | 状态 | 验收 |
|--------|------|------|
| M0 数据地基 | ✅ | 安装后近 N 天订单进 Turso，新单走 webhook（改订阅后仍须 deploy） |
| M1 商家开放安装 | ✅ | 能装；对话/Studio/计费可走通 |
| M2 告警 + 复盘 | ⬜ | 缺货 / SLA / 退款率告警；case 采纳与 7 天复盘 |
| M3 公开上架 | 🟡 清数/GDPR ✅；材料 ⬜ | 隐私政策、PCD、Listing、分发选定、App Store 审核；过审后恢复扩展 |
| M4 受控写回治理 | ⬜ | 统一 dry-run + 审计 + 回滚网关（能力已散落） |
| M5 广告归因加深 / SEO 周报 / 履约 | ⬜ | 点击 ID join、周报、承运商 API；不在 Catalog 上推倒重来 |

---

## 七、当前周期任务

### 已完成（勿再当缺口）

- [x] test/prod toml 订单类 webhook 订阅（prod 不含库存增量）
- [x] test 应用 deploy 使增量生效（2026-08-28 `aiassistant-test-119`）
- [x] 安装自动回补 `ensureInstallOrderBackfill`
- [x] 卸载 / `shop/redact` → `archiveAndPurgeShopData`；`customers/redact` 擦客户 PII
- [x] 防薅账本与推荐归因表在清数时保留

### 本周期应推进

- [ ] 隐私政策页 + Listing / 应用内链接（披露 shopHash 账本用途）
- [ ] Partner Dashboard：**选定分发方式**、PCD、Listing 素材、测试说明与凭据
- [ ] 核对测/产：`BILLING_GATEWAY`、`BILLING_TEST`、`PlanCatalog` 种子、邮件 / 飞书
- [ ] 1–2 家店冒烟：安装 → 回补 → 对话与 Today → 订阅/试用 → 卸载（确认 Blob 归档 + Turso 清空）
- [ ] （可选）告警中心第一刀：缺货或退款率 → 对话卡片 + 飞书
- [ ] 不要把统一 writeBack、竞品、WMS、点击 ID 归因当成本周期门禁

### App Store AI self-review

对照 [官方可本地检查条款](https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements) 与 [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)。**以当前要提交的 Partner 应用 toml 为准**。Listing / 隐私政策 / Partner 自动化检查 **不在** AI self-review 覆盖范围。

#### 最近一次：Spark AI / `shopify.app.prod.toml`（2026-08-28）

**Summary（代码可检查子集）**：✅ 约 30 · ❌ 0 · ⚠️ 4 · ⏭️ 8 组跳过（Payment / Purchase option / Checkout UI / Sales channel / Post-purchase / Donation 等；**5.1 Online store** 因扩展仅 `*.toml.off`、未随版本提交 Theme / Web Pixel）

代码侧 ⚠️（提交前用人测 / 配置核对）：

- [ ] **1.2.2 / 1.2.3** 计费：`replacementBehavior` 已接入；Render prod 确认 `BILLING_GATEWAY`≠`noop`、正式店勿开 `BILLING_TEST`。测：升/降配、拒费、卸载重装后再订。
- [ ] **3.2.1** `read_orders` 无 `read_all_orders`：订单镜像/Today 仅保证近 60 天 GraphQL 可读；listing 勿宣称更长历史，或另申请 scope。
- [ ] **3.1.1** TLS：提交前浏览器确认生产域名证书无告警。
- [ ] **2.3.x / 安装** OAuth 与重装：对 prod `shopify app deploy` 后走安装 → 授权 → `/app` → 卸载 → 重装。

审核期扩展姿态：

- [x] 版本内不提交 Web Pixel / Theme App Extension（`shopify.extension.toml.off`；Theme 块在 `_disabled_pixel_blocks/`）
- [ ] 过审后：按需加回 scope、还原 toml/blocks/入口，再 `shopify app deploy -c shopify.app.prod.toml`

已知、仍挡 Public / Unlisted（M3）：

- [x] GDPR 与卸载清数（见上）
- [ ] 无隐私政策 URL
- [ ] Partner：分发方式、PCD、Listing、测试说明与凭据

#### 历史：AiAssistant-Test / `shopify.app.test.toml`（2026-08-28）

结论与 prod 同：**代码侧无 ❌**；⚠️ 主要为 Billing 人测、TLS、60 天订单 scope；5.1 因扩展 `.off` 跳过。

### 本周期明确不做（页面也不展示）

- **风控链路**：Health Monitor 不渲染 `risk-control-health`；快照不产出 `risk-control` 环境。
- **回收期 ROI / 长期 ROI**：Today 首页只留短期 ROI 卡。
- **短期 ROI**：现有估算先留着；**等产品给出简单公式后再改计算**。

---

## 八、Shopify 分发（选定后不可改）

官方能力表见 [About app distribution](https://shopify.dev/docs/apps/launch/distribution)。**不是「选哪个都不影响」。**

| 方式 | 能装谁 | 审核 | Shopify Billing | 以后改成公开 |
|------|--------|------|-----------------|--------------|
| **Public + Unlisted** | 任意收到 listing / 安装链接的店 | 要（即使不搜索可见） | ✅ 可用 | 同一应用可再改为 Listed |
| **Custom** | 单店，或同一 Plus 组织多店，或 transfer-disabled 开发店 | 否 | ❌ **不能**走 Shopify 应用计费 | ❌ 不能改成 Public，只能再做一个新应用 |
| 旧 Unpublished / 后台 Private | 已废弃，不要用 | — | — | — |

Spark 订阅和购包已经接在 Shopify Billing 上。要装互不相关的真实店铺并收订阅 / 购包时：

- **必须选 Public**：Listed 出现在 App Store 搜索；Unlisted 不搜索、只靠链接安装。两种都要审核。
- **不要选 Custom**：会锁死计费，且不能再改成分发到任意店铺。
- **禁止**为每个商家复制一个 Custom 应用来绕过审核，违反 Partner 协议。

若目前只有开发店、或全是同一 Plus 组织、且可以暂时 `BILLING_GATEWAY=noop` / 只发试用：Custom 能更快发出安装链接，但日后要公开仍须新建 Public 应用并让商家重装。
