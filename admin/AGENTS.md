# AGENTS.md（Admin 后台）

本文件在 `admin/` 作用域内优先于根 `AGENTS.md`。全局边界（数据与外部系统所有权、Prisma/Turso 迁移规则、git 与生产纪律）仍以根 `AGENTS.md` 为准。

Admin 是独立项目：独立 `package.json`、依赖与构建流程，不能假设根目录命令会检查它。

```powershell
cd admin
npm run dev       # Express 3099 + Vite 5174
npm run build     # Vite client + tsc server
```

Admin 没有配置测试框架；改动后必须在 `admin/` 中运行 `npm run build`。修改共享 Prisma schema 后，主应用和 Admin 的 Prisma 类型/构建都要考虑。

## 1. 入口与鉴权

- API 入口：`admin/server/index.ts`、`admin/server/routes/`。
- 前端入口：`admin/src/App.tsx`、`admin/src/pages/`、`admin/src/api.ts`。
- 外部存储连接：`admin/server/lib/`。
- 鉴权边界：`admin/server/middleware/auth.ts`。收入、Pixel logs、TSF billing/revenue/ROI、OpenRouter 探测等 owner-only 路由在 `admin/server/index.ts` 使用 `requireOwner`。
- 登录为五人身份（Yewen / Allen / Zhuangze / Joel / Sun）+ 各人密码（`ADMIN_SECRET_YEWEN` / `_ALLEN` / `_ZHUANGZE` / `_JOEL` / `_SUN`）；Yewen、Allen 为 owner，其余为 user。顶栏显示姓名，不展示 Owner/User 字样。

## 2. 路由族

主要 API 路由族：

- **Spark 运营**：overview / shops / usage / capabilities / subscriptions / revenue / agent-runs / billing-rules / pricing-workbench / todos / ops-checklist / visit-source / support / app-logs / pixel-logs / shop-profile，另有 `spark-credits`（额度查询与系统奖励）、`referral-codes`（推荐码）、`spark-billing`（账单总览）、`promo/xhs`（小红书图文生成）。
- **TSF 观测**（`/api/tsf/*`）：overview / shops / usage / subscriptions / packs / billing / shop-profiles / language-coverage / revenue / roi / credits。
- **翻译运维只读/修复**：`/api/translations`、`/api/translation-ops`、`/api/shopify-translation`。
- **其它**：Redis Explorer、OpenRouter 探测。

`admin/server/routes/` 下所有路由文件都在 `admin/server/index.ts` 挂载，没有孤儿路由。

前端页面路由见 `admin/src/App.tsx`。Spark 侧栏含「账单总览」`/billing`、「用户额度」`/credits`、「推荐码」`/referral-codes`、「小红书图文」`/xhs-promo`、「定价工作台」`/pricing-workbench`；另有 `/translations`、`/shop-translation`、`/translation-ops`、`/shopify-translation`、`/translate-v4-support`、`/tsf/billing`、`/tsf/packs`、`/tsf/shop-profiles/:shop`、`/redis-explorer`。**改 Admin 导航前先读 `admin/src/App.tsx`，不要凭本节清单推断。**

翻译任务内容查看（`/translations/:id/content*`）用 `includeLiquid` 拼虚拟 module `CUSTOM_LIQUID`（`jobModulesWithLiquid`，与 TSF Worker 对齐），不要只读 Cosmos `job.modules`。

## 3. 页面细则

以下页面有不能退化的口径约束，改之前先看这一节。

### 小红书图文 `/xhs-promo`（Spark tab，所有登录用户）

`admin/src/pages/XhsPromo.tsx` + `admin/server/routes/xhsPromo.ts`。

分步确认：选题 → 可选标题（可改）→ 文案（可改）→ 封面与滑页分开出图。接口拆开成 `/titles`、`/copy`、`/cover`、`/cards`，改文案或调某一侧提示词不会重跑另一侧。

内容口径：

- 标题必须是选题的改写，不能另起卖点。
- 封面主文案锁定已定标题，分析来的风格不能盖掉标题。
- 图上不要画制作说明。下载一律 PNG。

选题步「选选题」和「参考笔记」二选一，不能同时用：

- **选选题**只走预设/手写选题，不分析链接。
- **参考笔记**先贴小红书链接（`POST /preview` 只读公开 OG，不带 Cookie、不走非官方 API）把读到的标题/简介/封面回填，缺的再手贴（最多 4 张）；再 `POST /analyze` 只拆这篇笔记的气质（不看预设选题），回填四套提示词后直接出标题，不再单独填选题/补充。

分析跟当前文案模型走：DeepSeek 只拆标题/正文，不看图也不上传图；GPT / 豆包有图才会看图。后续标题/文案/出图都跟当前这条路走，切来源会清空下游。

模型与凭证：

- 默认文案 DeepSeek（`DEEPSEEK_API_KEY`）。
- 默认封面火山方舟 Seedream（`VOLC_ARK_API_KEY` + `VOLC_ARK_IMAGE_MODEL`，默认 `doubao-seedream-5-0-pro-260628`）；封面还可选 GPT 或模板 SVG。
- 豆包写文仅在显式配置 `VOLC_ARK_TEXT_MODEL` 时出现在选项里，不要写死 `doubao-seed-1-6-251015`。
- 不要用旧视觉 `HUOSHAN_*` / `CVProcess`。

提示词：标题/文案/封面/滑页各自收起可改，可「保存此版」到 Admin 运维 Turso（`ADMIN_DATABASE_*`，表 `XhsPromoPromptVersion`，全员共用、只追加）；进页和切方向套该槽位该方向最新保存版，代码默认只兜底。提示词按黑/白/荧光黄绿信息卡。

滑页按提示词走封面同一套文生图（Seedream / GPT）出 PNG，模板只作失败回退。

不接 Playwright，不接小红书发帖。

### OpenRouter 探测 `/openrouter-probe`（Spark tab，owner）

`admin/src/pages/OpenRouterProbe.tsx` + `admin/server/routes/openrouterProbe.ts`。服务端用 `OPENROUTER_API_KEY` 转发 `/models` / `/chat/completions`，用于验证不同模型与地区出口；key 不下发浏览器。本地写在 `Spark/.env` 或 `admin/.env`，生产写 Render secrets。

### 翻译 ROI `/tsf/roi`（owner）

`admin/src/pages/tsf/TsfRoi.tsx` + `admin/server/routes/tsfRoi.ts`。安装/留存以 TSF `Account` 为准（`ShopBillingBinding` 已废弃）；Turso 收入/auto 已接；漏斗行为与 LLM 成本走 SLS（未接时页面 Mock + howto）。

### 每日收入 `/tsf/revenue`

`admin/src/pages/tsf/TsfRevenue.tsx` + `admin/server/routes/tsfRevenue.ts`。按 `BillingLog` × `PlanCatalog` 聚合。两条不能去掉的过滤：

- 必须排除 `metadata.source = legacy_migration`（Spring→Turso 迁移审计，非真实扣款日）。
- 同店 24h 内被后续 `SUBSCRIPTION_ACTIVATED` 覆盖的激活不计入（改套餐只计终态）。

### 语言覆盖率 `/tsf/language-coverage`

`admin/src/pages/tsf/TsfLanguageCoverage.tsx` + `admin/server/routes/tsfLanguageCoverage.ts`。商店列表以 Turso `Account`（在装）为准；目标语言/自动翻译来自 `ShopTargetLocale`；覆盖率按 `tsf:items_count:{shop}:{locale}` 批量查 Redis。快照约 60s，`refresh=1` 强制重载。

### 用户额度查询 `/tsf/credits`

`admin/src/pages/tsf/TsfCredits.tsx` + `admin/server/routes/tsfCredits.ts`。按 shop 查 TSF Turso：`Account` 额度拆分、`TOKEN_PACK_PURCHASED` 加购记录、`BillingLog` 流水与 `AccountPeriodUsage` 周期归档。支持添加/修改 `purchasedCredits`（`POST /api/tsf/credits/purchased`，审计事件 `ADMIN_PURCHASED_CREDITS_ADJUSTED`，不计入加购收入）；所有登录用户可查可改。

### 单字段翻译日志 `/tsf/single-translate-logs`

`admin/src/pages/tsf/TsfSingleTranslateLogs.tsx` + `admin/server/routes/tsfSingleTranslateLogs.ts`。只读 TSF Turso `CreditUsage`（`source=single`），展示扣费积分与 metadata，不含原文/译文。
