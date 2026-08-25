# Spark — Product Roadmap

> 对照当前代码更新。若本文档与代码冲突，以代码、`prisma/schema.prisma`、`AGENTS.md` 为准。
> 原则：邀请制内测先跑通「安装 → 有数据 → 能问/能看/能计费」→ 再公开上架 → 再做受控写回与跨渠道。

---

## 一、当前状态

| 能力 | 状态 | 说明 |
|------|------|------|
| LangGraph ReAct Agent / Ask 工作台 | ✅ 已上线 | `/app` + `/app/assistant`，上下文：商品 / 订单 / 文章 / 文件 |
| 六目的地 IA | ✅ 已上线 | Ask / Today / Health Monitor / Studio / Tasks / Settings |
| 商品文案 / 质量评分 / 写回 Shopify | ✅ 已上线 | Studio Copy；写回走现有商品更新 API，尚无统一 writeBack 治理层 |
| 图片翻译 / 图片生成 | ✅ 已上线 | Studio Image |
| 订单 / 退款 / 客户 / 库存 / 履约镜像 | ✅ 代码已落地 | `ShopOrder*` 等 + `app/server/shopify/sync/` + 对应 webhook 路由 |
| 历史回补 | ✅ 手动入口已有 | `/app/settings/data`；安装后自动回补见当前周期任务 |
| 经营体检 / Today / Health Monitor / Tasks | ✅ 已上线 | 快照走 `ensureDailySnapshotOverview` / `ensureDailySnapshot` |
| Playbook（只读） | ✅ 已注册 | `shopHealthCheck`、`productLaunchPipeline`、`inventoryRiskMitigation`、`refundIssueReview` |
| 指标计算器 | ✅ 已有基础 | `app/server/ai/semantics/metricsCalculator.server.ts`（GMV / Net Sales / 退款率 / 复购等） |
| Shopify 订阅 + Credit | ✅ 已上线 | 走 Shopify Billing；`BILLING_TEST` / `BILLING_GATEWAY` 按环境区分 |
| 广告 Catalog / Insights / Pixel | ✅ 已上线 | Meta / Google / TikTok；Theme Embed + Web Pixel |
| Admin 运营后台 | ✅ 已上线 | 独立 `admin/` |
| TSF 整店翻译执行 | 🚫 不在本仓库 | Admin 只读观测；不要当成本应用能力 |

**当前发布姿态**：邀请制商家内测。仓库**没有**独立生产 Partner 应用 toml；CI 只发 Spark Test（`shopify.app.test.toml` → Render Test）。公开 App Store 不是本周期目标。

**内测前仍卡住的缺口**（不是路线图远期项）：

1. `shopify.app.test.toml` 已写入订单 / 退款 / 库存 / 履约 webhook 订阅（与 yw / spark-zz 对齐）。**必须**对该配置 `shopify app deploy` 后，已装店铺才会收到增量；只改 toml 不生效。
2. 安装后自动回补近 N 天订单（默认 `SPARK_ORDER_BACKFILL_DAYS=30`）需收完并部署；仅靠 webhook 吃不到历史单。
3. 卸载目前只删 Session，不清理该店业务镜像。
4. 没有 Shopify 强制合规 webhook（`customers/data_request` / `customers/redact` / `shop/redact`）。邀请制可后补；公开上架会被拒。
5. 物流凭证写在 Render 本地 JSON，重启即丢；内测不要把它当核心路径。

---

## 二、整体目标架构

```
┌─────────────────────────────────────────────────────────┐
│                   工作台入口层                           │
│  Today / Health Monitor / 自动化   Ask / Playbook   Studio │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Playbook + Atomic Skills                    │
│  经营体检  上新  库存  退款  文案  图片  广告（已有）      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              数据层                                      │
│  Turso（业务镜像）  Cosmos（运行摘要）  Blob  SLS         │
│  Shopify Webhook 增量 + GraphQL 回补                     │
└─────────────────────────────────────────────────────────┘
```

---

## 三、路线图

### Phase 0 — 数据地基（代码已完成，配置未齐）

目标：Skills / Today 有可用镜像数据。

| 任务 | 状态 | 落点 |
|------|------|------|
| Prisma：`ShopOrder` / `ShopRefund` / `ShopCustomer` / `ShopInventoryLevel` / `ShopFulfillment` / `ShopSyncCheckpoint` | ✅ | `prisma/schema.prisma` |
| 同步 service | ✅ | `app/server/shopify/sync/` |
| Webhook 路由 | ✅ | `webhooks.orders.paid` 等 |
| 把 webhook **订阅进给商户用的 toml 并 deploy** | 🟡 toml 已补，待 deploy | `shopify.app.test.toml`；需 `shopify app deploy -c shopify.app.test.toml` |
| 手动回补 UI | ✅ | `/app/settings/data` |
| 安装后自动回补 | ⬜ 进行中 | `ensureInstallOrderBackfill` |
| `MetricsCalculator` | ✅ 基础版 | 尚未成为所有 Skills 的唯一口径源 |

不再需要新建 `Order` 等旧表名；以现有 `Shop*` 模型为准。

---

### Phase 1 — 只读闭环（主体已上线，告警/复盘未齐）

目标：商户先看到价值，发现 → 定位 → 方案，不扩写回治理。

| 能力 | 状态 |
|------|------|
| Today / Health Monitor / Tasks 正式入口 | ✅ |
| 经营体检 Playbook | ✅ `shopHealthCheck` |
| 上新流水线 Playbook | ✅ `productLaunchPipeline` |
| 库存止损 Playbook | ✅ `inventoryRiskMitigation` |
| 退款治理 Playbook | ✅ `refundIssueReview` |
| 首页经营摘要 + 巡检 | ✅ `HomePanel` / `workspaceDashboard` |
| 独立告警中心（缺货 / 超卖 / SLA / 退款率 → Chat + 飞书） | ⬜ 未建 `skills/alerts/` |
| case_id 绑定、采纳状态、7/14/30 天自动复盘卡 | ⬜ `agentRunLog` 有基础，闭环未完成 |

`app.today.diagnosis.tsx` 只做兼容跳转，不要再当正式诊断页升级。

---

### Phase 2 — 受控写回（未开始）

目标：统一 L2 写回（预览 + 确认 + 审计 + 回滚）。商品文案写回已经存在，但**没有** `app/server/ai/writeBack/` 治理层。

- 写回网关：`dry_run`、`idempotency_key`、审计、回滚快照
- 商品内容 / 上下架（`write_products`）
- 促销（`write_discounts`，需新 scope）
- 客户分群 + 营销推送（频控 / 黑名单）

---

### Phase 3 — 跨渠道扩展（部分已提前落地）

广告 Catalog / Insights / Pixel **已在 Settings / Ads Catalog 上线**，不再是「从零对接凭证」。本阶段剩余：

| 任务 | 状态 |
|------|------|
| 广告凭证 + 目录同步 + 结构洞察 | ✅ |
| 广告归因对齐（UTM / 点击 ID ↔ 站内订单） | ⬜ |
| 预算 pacing 告警、广告写回 | ⬜ |
| GA4 / GSC / PageSpeed / ShopifyQL | ✅ Settings 已有 |
| 落地页漏斗（Pixel + 订单 landingSite） | 🟡 Today 已有第一版，未做成独立 SEO 周报 |
| 履约承运商 API / WMS | ⬜；现有物流凭证存储不适合生产 |
| 竞品监控 | ⬜ |

---

### Phase 4 — 多模态增强（按需，不挡内测）

窄场景、可复核：商品图质检、素材归类、竞品截图解析。核心诊断仍以结构化数据为主。

---

## 四、优先级（邀请制内测视角）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| Test/内测应用补齐 webhook 订阅并 deploy | P0 | 没有增量就没有经营数据 |
| 安装自动回补 + 同步中空态 | P0 | webhook 只吃新单 |
| 生产/内测环境计费开关核对 | P0 | 真店不要 `BILLING_GATEWAY=noop`；测试店才开 `BILLING_TEST` |
| Partner 分发方式选定（见下文） | P0 | **选定后不可改**；选错会锁死计费或多店安装 |
| 1–2 家店走通安装 / 回补 / Today / 订阅 / 卸载 | P0 | |
| 卸载清理该店镜像 | P1 | 邀请制建议做；上架必做 |
| GDPR 强制 webhook + 隐私政策 | P1 | 公开上架才变成 P0 |
| 独立告警中心 / case 复盘 | P2 | 不挡首批邀请 |
| 写回治理 / 促销 / 竞品 / WMS | P2+ | 内测后 |

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
├── {name}Graph.ts
├── {name}Nodes.ts
├── {name}State.ts
└── index.ts
```

现有四个 Playbook 只注册在 `app/server/ai/playbooks/index.ts`，不要另起一套目录。

### 5.3 写回（Phase 2+ 才强制）

- [ ] `dry_run` 默认开启
- [ ] `idempotency_key`
- [ ] 审计日志
- [ ] 回滚快照或强风控
- [ ] 默认人工确认（L2）

### 5.4 Skill 版本化

`skill_id` + `version`；规则 / 提示词 / 阈值变更时递增。

---

## 六、里程碑

| 里程碑 | 状态 | 验收 |
|--------|------|------|
| M0 数据地基 | 🟡 toml 已补订阅，待 `shopify app deploy` | 安装后近 N 天订单进 Turso，新单走 webhook |
| M1 邀请制内测 | ⬜ 当前周期 | 指定店铺能安装；Today/Ask/Studio/计费可走通；不公开搜索 |
| M2 告警 + 复盘 | ⬜ | 缺货 / SLA / 退款率告警；case 采纳与 7 天复盘 |
| M3 公开上架 | ⬜ | GDPR webhook、卸载清数据、PCD、隐私政策、App Store 审核 |
| M4 受控写回 | ⬜ | 商品/促销写回带 dry-run + 审计 + 回滚 |
| M5 广告归因 / SEO 周报 / 履约增强 | ⬜ | 在已有 Catalog 之上补齐，而不是重做广告接入 |

---

## 七、当前周期任务（邀请制内测）

- [x] Test 应用 toml 已补齐订单类 webhook 订阅（`shopify.app.test.toml`）
- [ ] 对 Test 应用 `shopify app deploy -c shopify.app.test.toml`，让已装店铺真正收到增量
- [ ] 收完并部署安装自动回补（`ensureInstallOrderBackfill`）与同步中空态
- [ ] 核对内测环境：`BILLING_GATEWAY`、`BILLING_TEST`、`PlanCatalog` 种子、SES / 飞书
- [ ] Partner Dashboard **选定分发方式**（选定后不可改，见下节）
- [ ] 用 1–2 家店冒烟：安装 → 回补 → Today → Ask → Studio → 订阅/试用 → 卸载
- [ ] （P1）卸载删除该店业务镜像
- [ ] 不要把告警中心、writeBack、竞品、WMS、App Store 素材当成本周期门禁

---

## 八、邀请制内测的 Shopify 分发（选定后不可改）

官方能力表见 [About app distribution](https://shopify.dev/docs/apps/launch/distribution)。**不是「选哪个都不影响」。**

| 方式 | 能装谁 | 审核 | Shopify Billing | 以后改成公开 |
|------|--------|------|-----------------|--------------|
| **Public + Unlisted** | 任意收到 listing / 安装链接的店 | 要（即使不搜索可见） | ✅ 可用 | 同一应用可再改为 Listed |
| **Custom** | 单店，或同一 Plus 组织多店，或 transfer-disabled 开发店 | 否 | ❌ **不能**走 Shopify 应用计费 | ❌ 不能改成 Public，只能再做一个新应用 |
| 旧 Unpublished / 后台 Private | 已废弃，不要用 | — | — | — |

Spark 订阅和购包已经接在 Shopify Billing 上。邀请**多家互不相关的真实店铺**并要收订阅 / 购包时：

- **推荐 Public，listing 设为 Unlisted**：不出现在 App Store 搜索，只把链接发给受邀商家。
- **不要选 Custom**：会锁死计费，且不能再改成分发到任意店铺。
- **禁止**为每个商家复制一个 Custom 应用来绕过审核，违反 Partner 协议。

若内测店全是开发店、或全是同一 Plus 组织、且可以暂时 `BILLING_GATEWAY=noop` / 只发试用：Custom 能更快发出安装链接，但日后公开仍要新建 Public 应用并让商家重装。
