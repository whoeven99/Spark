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
  /** 相对安装 cohort 的占比 0–100 */
  pctOfInstall: number;
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

    const installCohort = Number(bindingResult.rows[0]?.total ?? 0);
    const installed = Number(installedResult.rows[0]?.total ?? 0);
    const activeSubs = Number(activeSubsResult.rows[0]?.total ?? 0);
    const mrr = Number(mrrResult.rows[0]?.mrr ?? 0);
    const payingCustomers = Number(mrrResult.rows[0]?.payingCustomers ?? 0);
    const arpu = payingCustomers > 0 ? mrr / payingCustomers : 0;
    const packRevenue30d = Number(packResult.rows[0]?.packRevenue ?? 0);
    const packShops30d = Number(packResult.rows[0]?.packShops ?? 0);
    const autoShops = Number(autoShopsResult.rows[0]?.total ?? 0);

    const [trialShops, expandShops] = await Promise.all([
      countDistinctShopsWithTaskSource("TsFrontend-Trial"),
      countDistinctShopsWithTaskSource("TsFrontend-Expand"),
    ]);

    const trialWired = trialShops != null;
    const expandWired = expandShops != null;
    const trialCount = trialShops ?? Math.round(installCohort * 0.41);
    const expandCount = expandShops ?? Math.round(installCohort * 0.18);

    const firstPayCount = Math.max(payingCustomers, packShops30d);
    // 首次付费店数：当前用「活跃订阅 ∪ 近30天买包店」近似，非严格 cohort
    const firstPayApprox = Math.min(
      installCohort || firstPayCount,
      Math.max(payingCustomers, Math.round((payingCustomers + packShops30d) * 0.7)),
    );

    const funnel: RoiFunnelStep[] = [
      {
        key: "install",
        label: "安装 / Binding",
        count: installCohort,
        pctOfInstall: installCohort > 0 ? 100 : 0,
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "trial",
        label: "试用任务（有 Trial job）",
        count: trialCount,
        pctOfInstall:
          installCohort > 0 ? Math.round((trialCount / installCohort) * 1000) / 10 : 0,
        wired: trialWired,
        source: trialWired ? "cosmos" : "mock",
        howto: trialWired
          ? null
          : "在 Admin 配置 COSMOS_ENDPOINT / COSMOS_KEY，按 taskSource=TsFrontend-Trial 聚合 DISTINCT shopName；完成态可再加 status=COMPLETED + translateTotal>0。",
      },
      {
        key: "expand",
        label: "起步包（有 Expand job）",
        count: expandCount,
        pctOfInstall:
          installCohort > 0 ? Math.round((expandCount / installCohort) * 1000) / 10 : 0,
        wired: expandWired,
        source: expandWired ? "cosmos" : "mock",
        howto: expandWired
          ? null
          : "Cosmos 聚合 taskSource=TsFrontend-Expand；建议只计 COMPLETED 且 metrics.translateTotal>0，避免空任务虚高。",
      },
      {
        key: "first_pay",
        label: "首次付费（近似）",
        count: firstPayApprox,
        pctOfInstall:
          installCohort > 0
            ? Math.round((firstPayApprox / installCohort) * 1000) / 10
            : 0,
        wired: false,
        source: "mock",
        howto:
          "需 SLS/BillingLog 按 shop 取首次 SUBSCRIPTION_ACTIVATED 或 TOKEN_PACK_PURCHASED 时间，再与安装 cohort 求交。当前为活跃订阅与买包店的粗估。",
      },
      {
        key: "auto",
        label: "开启自动更新",
        count: autoShops,
        pctOfInstall:
          installCohort > 0 ? Math.round((autoShops / installCohort) * 1000) / 10 : 0,
        wired: true,
        source: "turso",
        howto: null,
      },
    ];

    const overview: RoiMetric[] = [
      {
        key: "install_cohort",
        label: "安装 cohort (tsf binding)",
        value: installCohort,
        display: String(installCohort),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "installed",
        label: "当前在装",
        value: installed,
        display: String(installed),
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
        key: "active_subs",
        label: "活跃订阅",
        value: activeSubs,
        display: String(activeSubs),
        wired: true,
        source: "turso",
        howto: null,
      },
      {
        key: "auto_shops",
        label: "已开 auto 店数",
        value: autoShops,
        display: String(autoShops),
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
      {
        key: "trial_to_expand",
        label: "试用→起步（示意）",
        value: trialCount > 0 ? (expandCount / trialCount) * 100 : 0,
        display: trialCount > 0 ? pct((expandCount / trialCount) * 100) : "—",
        wired: trialWired && expandWired,
        source: trialWired && expandWired ? "cosmos" : "mock",
        howto:
          trialWired && expandWired
            ? null
            : "依赖 Cosmos Trial/Expand 店级完成态；完成后再算严格转化。",
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

    const bottleneckKey =
      trialWired && expandWired && trialCount > 0 && expandCount / trialCount < 0.5
        ? "trial_to_expand"
        : !trialWired
          ? "funnel_data"
          : "paying_no_auto";

    const decision = {
      wired: trialWired && expandWired,
      source: (trialWired && expandWired ? "cosmos" : "mock") as RoiSource,
      title:
        bottleneckKey === "trial_to_expand"
          ? "瓶颈：试用 → 起步"
          : bottleneckKey === "funnel_data"
            ? "优先接入漏斗数据"
            : "关注：已付费未开 auto",
      body:
        bottleneckKey === "trial_to_expand"
          ? `试用店 ${trialCount} → 起步店 ${expandCount}（${pct((expandCount / trialCount) * 100)}）。优先修起步包空任务与额度预估，不要先加获客。`
          : bottleneckKey === "funnel_data"
            ? "漏斗行为尚未进 SLS，Cosmos 完成态也可能未配置。先接数据再做转化决策；下方「待接入」列出步骤。"
            : `有 ${payingNoAuto.length} 家活跃付费店未开自动更新（表中最多 20）。优先站内引导开 auto，提高留存与额度消耗。`,
      howto:
        trialWired && expandWired
          ? null
          : "接好 Cosmos Trial/Expand 店级完成态 + SLS funnel 事件后，决策条可自动标最差漏斗格。",
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
        title: "Cosmos 完成态口径",
        detail:
          "Trial/Expand 用 DISTINCT shop + COMPLETED + translateTotal>0；空任务单独报警。",
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
        id: "first-pay-cohort",
        title: "首次付费 cohort",
        detail:
          "BillingLog 按 shop 取首笔订阅/加量包时间，与安装日对齐算严格付费率。",
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
        "绿色/已接入 = Turso 或 Cosmos 实时查询。",
        "橙色感叹号 = mock 或近似，见 howto / 待接入清单。",
        "收入明细仍以「翻译 收入」页为准；本页聚焦闭环决策。",
      ],
    });
  } catch (err) {
    console.error("[tsf/roi]", err);
    res.status(500).json({ error: String(err) });
  }
});
