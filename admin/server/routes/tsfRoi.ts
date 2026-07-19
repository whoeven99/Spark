import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";

export const tsfRoiRouter = Router();

type RoiSource = "turso" | "cosmos" | "sls" | "mock";

export type RoiMetric = {
  key: string;
  label: string;
  value: number | string | null;
  /** 展示用字符串；缺省时前端自行格式化 value */
  display: string;
  wired: boolean;
  source: RoiSource;
  /** 未接入时：还需要怎么做 */
  howto: string | null;
};

export type RoiFunnelStep = {
  key: string;
  label: string;
  count: number;
  /** 相对总安装的占比 0–100 */
  pctOfInstall: number;
  /** forward=正向；churn=卸载旁路；branch=末级并列（订阅/auto） */
  kind: "forward" | "churn" | "branch";
  note: string | null;
  wired: boolean;
  source: RoiSource;
  howto: string | null;
};

export type RoiActionRow = {
  shop: string;
  signal: string;
  detail: string;
  wired: boolean;
  source: RoiSource;
};

export type RoiHowtoItem = {
  id: string;
  title: string;
  detail: string;
  priority: "P0" | "P1" | "P2";
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

async function countDistinctShopsWithTaskSource(
  taskSource: string,
): Promise<number | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getTranslationJobsContainer();
    const { resources } = await container.items
      .query<string>({
        query: `SELECT DISTINCT VALUE c.shopName FROM c WHERE c.taskSource = @source`,
        parameters: [{ name: "@source", value: taskSource }],
      })
      .fetchAll();
    return resources.length;
  } catch (err) {
    console.warn(`[tsf/roi] cosmos count ${taskSource} failed`, err);
    return null;
  }
}

/** 试用 ∪ 起步包（任一 taskSource）店数 */
async function countActivatedShops(): Promise<number | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getTranslationJobsContainer();
    const { resources } = await container.items
      .query<string>({
        query: `
          SELECT DISTINCT VALUE c.shopName FROM c
          WHERE c.taskSource = @trial OR c.taskSource = @expand
        `,
        parameters: [
          { name: "@trial", value: "TsFrontend-Trial" },
          { name: "@expand", value: "TsFrontend-Expand" },
        ],
      })
      .fetchAll();
    return resources.length;
  } catch (err) {
    console.warn("[tsf/roi] cosmos activated union failed", err);
    return null;
  }
}

function rate(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * GET /api/tsf/roi
 * 翻译产品 ROI 看板：能接的接 Turso/Cosmos，缺的返回 mock + howto。
 */
tsfRoiRouter.get("/", async (_req, res) => {
  try {
    const db = getTsfDb();
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

    const [
      bindingResult,
      installedResult,
      activeSubsResult,
      mrrResult,
      packResult,
      autoShopsResult,
      everSubscribedResult,
      payingNoAutoResult,
    ] = await Promise.all([
      db.execute(
        "SELECT COUNT(*) as total FROM ShopBillingBinding WHERE billingSystem = 'tsf'",
      ),
      db.execute(
        `SELECT COUNT(*) as total
         FROM ShopBillingBinding b
         WHERE b.billingSystem = 'tsf'
           AND EXISTS (SELECT 1 FROM Session s WHERE s.shop = b.shop)`,
      ),
      db.execute(
        "SELECT COUNT(*) as total FROM AppSubscription WHERE status = 'ACTIVE'",
      ),
      db.execute(`
        SELECT
          SUM(
            CASE
              WHEN pc.billingInterval = 'MONTHLY' THEN CAST(pc.priceAmount AS REAL)
              WHEN pc.billingInterval = 'ANNUAL'  THEN CAST(pc.priceAmount AS REAL) / 12.0
              ELSE 0
            END
          ) as mrr,
          COUNT(DISTINCT sub.shop) as payingCustomers
        FROM AppSubscription sub
        INNER JOIN PlanCatalog pc ON sub.planKey = pc.planKey
        WHERE sub.status = 'ACTIVE'
          AND pc.kind = 'SUBSCRIPTION'
          AND CAST(pc.priceAmount AS REAL) > 0
      `),
      db.execute({
        sql: `
          SELECT
            COALESCE(SUM(CAST(pc.priceAmount AS REAL)), 0) as packRevenue,
            COUNT(DISTINCT bl.shop) as packShops
          FROM BillingLog bl
          INNER JOIN PlanCatalog pc ON bl.planKey = pc.planKey
          WHERE bl.eventType = 'TOKEN_PACK_PURCHASED'
            AND bl.createdAt >= ?
            AND CAST(pc.priceAmount AS REAL) > 0
        `,
        args: [since],
      }),
      db.execute(`
        SELECT COUNT(DISTINCT shop) as total
        FROM ShopTargetLocale
        WHERE autoTranslate = 1
      `),
      db.execute(`
        SELECT COUNT(DISTINCT b.shop) as total
        FROM ShopBillingBinding b
        INNER JOIN BillingLog bl
          ON bl.shop = b.shop AND bl.eventType = 'SUBSCRIPTION_ACTIVATED'
        WHERE b.billingSystem = 'tsf'
      `),
      db.execute(`
        SELECT
          sub.shop,
          sub.planKey,
          CASE
            WHEN pc.billingInterval = 'MONTHLY' THEN CAST(pc.priceAmount AS REAL)
            WHEN pc.billingInterval = 'ANNUAL'  THEN CAST(pc.priceAmount AS REAL) / 12.0
            ELSE 0
          END as shopMrr
        FROM AppSubscription sub
        INNER JOIN PlanCatalog pc ON sub.planKey = pc.planKey
        WHERE sub.status = 'ACTIVE'
          AND pc.kind = 'SUBSCRIPTION'
          AND CAST(pc.priceAmount AS REAL) > 0
          AND NOT EXISTS (
            SELECT 1 FROM ShopTargetLocale stl
            WHERE stl.shop = sub.shop AND stl.autoTranslate = 1
          )
        ORDER BY shopMrr DESC
        LIMIT 20
      `),
    ]);

    const installTotal = Number(bindingResult.rows[0]?.total ?? 0);
    const retained = Number(installedResult.rows[0]?.total ?? 0);
    const uninstalled = Math.max(0, installTotal - retained);
    const activeSubs = Number(activeSubsResult.rows[0]?.total ?? 0);
    const mrr = Number(mrrResult.rows[0]?.mrr ?? 0);
    const payingCustomers = Number(mrrResult.rows[0]?.payingCustomers ?? 0);
    const arpu = payingCustomers > 0 ? mrr / payingCustomers : 0;
    const packRevenue30d = Number(packResult.rows[0]?.packRevenue ?? 0);
    const autoShops = Number(autoShopsResult.rows[0]?.total ?? 0);
    const everSubscribed = Number(everSubscribedResult.rows[0]?.total ?? 0);

    const [activatedRaw, trialShops, expandShops] = await Promise.all([
      countActivatedShops(),
      countDistinctShopsWithTaskSource("TsFrontend-Trial"),
      countDistinctShopsWithTaskSource("TsFrontend-Expand"),
    ]);

    const activatedWired = activatedRaw != null;
    const trialWired = trialShops != null;
    const expandWired = expandShops != null;
    const trialCount = trialShops ?? Math.round(installTotal * 0.35);
    const expandCount = expandShops ?? Math.round(installTotal * 0.18);
    const activatedCount =
      activatedRaw ??
      Math.min(installTotal, Math.round((trialCount + expandCount) * 0.85));

    /**
     * 主漏斗：
     * 总安装 → 试用过/起步包 → 留存（在装）→ 订阅 / 自动更新
     * 卸载 = 总安装 − 留存（旁路展示）
     */
    const funnel: RoiFunnelStep[] = [
      {
        key: "install",
        label: "总安装",
        count: installTotal,
        pctOfInstall: installTotal > 0 ? 100 : 0,
        kind: "forward",
        note: "ShopBillingBinding = tsf（近似历史安装）",
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "activated",
        label: "试用过 / 起步包",
        count: activatedCount,
        pctOfInstall: rate(activatedCount, installTotal),
        kind: "forward",
        note: activatedWired
          ? `Trial ${trialCount} ∪ Expand ${expandCount}（有对应 job 的店）`
          : `Mock · Trial≈${trialCount} Expand≈${expandCount}`,
        wired: activatedWired,
        source: activatedWired ? "cosmos" : "mock",
        howto: activatedWired
          ? null
          : "Cosmos：DISTINCT shopName WHERE taskSource IN (TsFrontend-Trial, TsFrontend-Expand)。后续可收紧为 COMPLETED + translateTotal>0。",
      },
      {
        key: "retained",
        label: "留存（在装）",
        count: retained,
        pctOfInstall: rate(retained, installTotal),
        kind: "forward",
        note: "仍有 Session 的 Binding 店",
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "uninstalled",
        label: "已卸载",
        count: uninstalled,
        pctOfInstall: rate(uninstalled, installTotal),
        kind: "churn",
        note: "总安装 − 留存（无 Session）",
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "subscribed",
        label: "订阅数（ACTIVE）",
        count: activeSubs,
        pctOfInstall: rate(activeSubs, installTotal),
        kind: "branch",
        note: `曾订阅 ${everSubscribed} 店（含已取消）· 安装→曾订阅 ${pct(rate(everSubscribed, installTotal))}`,
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "auto",
        label: "开启自动更新",
        count: autoShops,
        pctOfInstall: rate(autoShops, installTotal),
        kind: "branch",
        note:
          activeSubs > 0
            ? `占活跃订阅 ${pct(rate(autoShops, activeSubs))}`
            : null,
        wired: true,
        source: "turso",
        howto: null,
      },
    ];

    const chainRates = {
      installToActivated: {
        label: "安装 → 试用/起步",
        value: rate(activatedCount, installTotal),
        wired: activatedWired,
      },
      installToRetained: {
        label: "安装 → 留存",
        value: rate(retained, installTotal),
        wired: true,
      },
      installToUninstalled: {
        label: "安装 → 卸载",
        value: rate(uninstalled, installTotal),
        wired: true,
      },
      installToEverSubscribed: {
        label: "安装 → 曾订阅",
        value: rate(everSubscribed, installTotal),
        wired: true,
      },
      installToActiveSub: {
        label: "安装 → 当前订阅",
        value: rate(activeSubs, installTotal),
        wired: true,
      },
      installToAuto: {
        label: "安装 → 开 auto",
        value: rate(autoShops, installTotal),
        wired: true,
      },
      retainedToActiveSub: {
        label: "留存 → 当前订阅",
        value: rate(activeSubs, retained),
        wired: true,
      },
      activeSubToAuto: {
        label: "订阅 → 开 auto",
        value: rate(autoShops, activeSubs),
        wired: true,
      },
    };

    const overview: RoiMetric[] = [
      {
        key: "install_total",
        label: "总安装",
        value: installTotal,
        display: String(installTotal),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "activated",
        label: "试用过/起步包",
        value: activatedCount,
        display: String(activatedCount),
        wired: activatedWired,
        source: activatedWired ? "cosmos" : "mock",
        howto: activatedWired
          ? null
          : "Cosmos 聚合 Trial∪Expand DISTINCT shop；未配置时为 Mock。",
      },
      {
        key: "retained",
        label: "留存（在装）",
        value: retained,
        display: String(retained),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "uninstalled",
        label: "已卸载",
        value: uninstalled,
        display: `${uninstalled}（${pct(rate(uninstalled, installTotal))}）`,
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "ever_subscribed_rate",
        label: "安装→曾订阅",
        value: rate(everSubscribed, installTotal),
        display: pct(rate(everSubscribed, installTotal)),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "active_subs",
        label: "订阅数 ACTIVE",
        value: activeSubs,
        display: String(activeSubs),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "auto_shops",
        label: "开启自动更新",
        value: autoShops,
        display: String(autoShops),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "mrr",
        label: "MRR",
        value: mrr,
        display: usd(mrr),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "pack_30d",
        label: `加量包收入 (${windowDays}d)`,
        value: packRevenue30d,
        display: usd(packRevenue30d),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "arpu",
        label: "付费 ARPU",
        value: arpu,
        display: usd(arpu),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "llm_cost",
        label: `LLM 成本 (${windowDays}d)`,
        value: null,
        display: "—",
        wired: false,
        source: "sls",
        howto:
          "TSF Worker 任务结束写 SLS topic=tsf:cost（shop/jobId/model/tokens/costUsd），Admin GetLogs 聚合。",
      },
      {
        key: "gross_margin",
        label: "估毛利率",
        value: null,
        display: "—",
        wired: false,
        source: "sls",
        howto: "收入(Turso) − LLM成本(SLS) − 基建分摊后计算；(收入−成本)/收入。",
      },
    ];

    const slsEvents = [
      { name: "trial_create_click", count: 820 },
      { name: "trial_save_ok", count: 510 },
      { name: "expand_starter_complete", count: 290 },
      { name: "expand_buy_pack_click", count: 160 },
      { name: "expand_subscribe_click", count: 95 },
      { name: "expand_auto_enabled_ok", count: 88 },
    ].map((e) => ({
      ...e,
      wired: false as const,
      source: "mock" as const,
      howto:
        "TSF useReport 现只打 GA。改为写 SLS topic=tsf:funnel（shop/name/eventType），Admin 按 name 聚合 count。",
    }));

    const stuckTrialMock: RoiActionRow[] = [
      {
        shop: "alpha-demo.myshopify.com",
        signal: "试用完成，未起步",
        detail: "MOCK · 待 SLS+Cosmos join",
        wired: false,
        source: "mock",
      },
      {
        shop: "bravo-demo.myshopify.com",
        signal: "起步空任务",
        detail: "MOCK · COMPLETED translateTotal=0",
        wired: false,
        source: "mock",
      },
      {
        shop: "charlie-demo.myshopify.com",
        signal: "点过买包未付",
        detail: "MOCK · 需 SLS expand_buy_pack_click",
        wired: false,
        source: "mock",
      },
    ];

    const payingNoAuto: RoiActionRow[] = payingNoAutoResult.rows.map((r) => ({
      shop: String(r.shop),
      signal: "已订阅未开 auto",
      detail: `${String(r.planKey ?? "-")} · MRR ${usd(Number(r.shopMrr ?? 0))}`,
      wired: true,
      source: "turso" as const,
    }));

    const uninstallRate = rate(uninstalled, installTotal);
    const activateRate = rate(activatedCount, installTotal);
    const subAmongRetained = rate(activeSubs, retained);

    let bottleneckKey: "uninstall" | "activate" | "monetize" | "auto" | "funnel_data";
    if (!activatedWired) {
      bottleneckKey = "funnel_data";
    } else if (uninstallRate >= 40) {
      bottleneckKey = "uninstall";
    } else if (activateRate < 25) {
      bottleneckKey = "activate";
    } else if (subAmongRetained < 20) {
      bottleneckKey = "monetize";
    } else {
      bottleneckKey = "auto";
    }

    const decision = {
      wired: activatedWired,
      source: (activatedWired ? "turso" : "mock") as RoiSource,
      title:
        bottleneckKey === "uninstall"
          ? "瓶颈：卸载偏高"
          : bottleneckKey === "activate"
            ? "瓶颈：试用/起步激活低"
            : bottleneckKey === "monetize"
              ? "瓶颈：留存→订阅"
              : bottleneckKey === "funnel_data"
                ? "优先接入激活数据"
                : "关注：订阅→开 auto",
      body:
        bottleneckKey === "uninstall"
          ? `总安装 ${installTotal}，已卸载 ${uninstalled}（${pct(uninstallRate)}）。先查卸载前是否完成试用/起步，再决定补激活还是补留存。`
          : bottleneckKey === "activate"
            ? `安装→试用/起步仅 ${pct(activateRate)}（Trial ${trialCount} / Expand ${expandCount}）。优先拉高试用与起步包完成，不要先加获客。`
            : bottleneckKey === "monetize"
              ? `留存 ${retained} 店中当前订阅 ${activeSubs}（${pct(subAmongRetained)}）；安装→曾订阅 ${pct(rate(everSubscribed, installTotal))}。优先订阅转化 CTA。`
              : bottleneckKey === "funnel_data"
                ? "试用/起步店数依赖 Cosmos。未配置时激活步为 Mock；Turso 的安装/留存/卸载/订阅/auto 已可用。"
                : `活跃订阅 ${activeSubs}，已开 auto ${autoShops}（${pct(rate(autoShops, activeSubs))}）；未开 auto 列表见下方（最多 20）。`,
      howto: activatedWired
        ? null
        : "配置 COSMOS_* 后，激活步改为 Trial∪Expand 真实 DISTINCT shop；完成态可再收紧。",
    };

    const howtoList: RoiHowtoItem[] = [
      {
        id: "sls-funnel",
        title: "SLS 漏斗打点",
        detail:
          "TSF 将 trial_* / expand_* 等写入阿里云 SLS（topic=tsf:funnel），Admin 用 GetLogs 聚合；不要只依赖 GA。",
        priority: "P0",
      },
      {
        id: "cosmos-complete",
        title: "激活步完成态",
        detail:
          "试用过/起步包：DISTINCT shop WHERE taskSource IN (Trial, Expand)；可再要求 COMPLETED + translateTotal>0。",
        priority: "P0",
      },
      {
        id: "sls-cost",
        title: "Worker 成本打点",
        detail:
          "translate/writeback 结束写 tsf:cost（tokens、model、costUsd），才能算毛利。",
        priority: "P1",
      },
      {
        id: "n-day-sub",
        title: "N 日安装→订阅",
        detail:
          "Binding.createdAt cohort + 首次 SUBSCRIPTION_ACTIVATED ≤N 天；未满 N 天的安装不进分母。",
        priority: "P1",
      },
      {
        id: "cac",
        title: "CAC 手工录入",
        detail: "月获客花费录入后算回收期；可先做 Admin 简单配置项。",
        priority: "P2",
      },
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      windowDays,
      decision,
      overview,
      funnel,
      chainRates,
      breakdown: {
        trialShops: trialCount,
        expandShops: expandCount,
        trialWired,
        expandWired,
        everSubscribed,
      },
      slsEvents,
      actionLists: {
        stuckTrialExpand: {
          title: "卡在试用→起步",
          wired: false,
          source: "mock" as const,
          howto:
            "SLS 事件 + Cosmos job 按 shop join：试用完成且无成功 Expand，或 Expand 空任务。",
          rows: stuckTrialMock,
        },
        payingNoAuto: {
          title: "已付费未开 auto",
          wired: true,
          source: "turso" as const,
          howto: null,
          rows: payingNoAuto,
        },
      },
      howtoList,
      notes: [
        "主链路：总安装 → 试用过/起步包 → 留存 → 订阅 / 自动更新；卸载 = 总安装 − 留存。",
        "绿色/已接入 = Turso 或 Cosmos；橙色 = Mock，见 howto。",
        "收入明细仍以「翻译 收入」页为准。",
      ],
    });
  } catch (err) {
    console.error("[tsf/roi]", err);
    res.status(500).json({ error: String(err) });
  }
});
