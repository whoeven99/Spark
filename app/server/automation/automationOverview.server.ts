/**
 * 自动化面板数据组装（阶段 4：替换前端 mock 常量）。
 *
 * 当前系统真实存在的自动化只有「每日经营巡检」（懒触发：当日首次访问经营看板时
 * 由 dailyInspection.server 生成快照）；任务模板来自 Playbook 注册表——
 * 它们可在对话中触发，是后续定时执行的候选。
 */
import prisma from "../../db.server";
import "../ai/playbooks/index";
import {
  globalPlaybookRegistry,
  type PlaybookDefinition,
} from "../ai/core/playbookRegistry.server";
import { normalizeSteps } from "../ai/core/skillTypes.server";
import type {
  AutomationConfiguredItem,
  AutomationHistoryItem,
  AutomationOverview,
  AutomationTemplateItem,
  PlaybookSurfaceItem,
} from "../../lib/automationOverviewTypes";

const HISTORY_DAYS = 7;

function countByStatus(items: Array<{ status: string }>): { risk: number; watch: number } {
  let risk = 0;
  let watch = 0;
  for (const item of items) {
    if (item.status === "risk") risk += 1;
    else if (item.status === "watch") watch += 1;
  }
  return { risk, watch };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberMetric(metrics: unknown, key: string): number {
  if (!isRecord(metrics)) return 0;
  const raw = metrics[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function stringMetric(metrics: unknown, key: string, fallback = ""): string {
  if (!isRecord(metrics)) return fallback;
  const raw = metrics[key];
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function statusFor(
  items: Array<{ key: string; status: string }>,
  key: string,
): string | null {
  return items.find((item) => item.key === key)?.status ?? null;
}

function toPlaybookSurfaceItem(
  def: PlaybookDefinition,
  options: {
    evidence?: string[];
    recommendationReason?: string;
    recommended?: boolean;
  } = {},
): PlaybookSurfaceItem {
  const presentation = def.presentation;
  const title = presentation?.entryTitle ?? def.displayName;
  return {
    id: def.name,
    title,
    detail: def.description,
    category: def.category,
    steps: normalizeSteps(def.steps).map((step) => step.label),
    icon: presentation?.icon,
    entrySubtitle: presentation?.entrySubtitle,
    defaultPrompt:
      presentation?.defaultPrompt ?? `运行 Playbook「${title}」`,
    ctaLabel: presentation?.ctaLabel ?? "在对话中运行",
    evidence: options.evidence ?? [],
    recommendationReason: options.recommendationReason,
    recommended: options.recommended,
  };
}

function buildRecommendedPlaybooks(params: {
  definitions: PlaybookDefinition[];
  latest: {
    hasData: boolean;
    metrics: unknown;
    items: Array<{ key: string; status: string }>;
  } | null;
  counts: { risk: number; watch: number };
}): PlaybookSurfaceItem[] {
  const byName = new Map(params.definitions.map((def) => [def.name, def]));
  const result: PlaybookSurfaceItem[] = [];
  const latest = params.latest;
  const metrics = latest?.metrics;
  const currency = stringMetric(metrics, "currency", "");

  const push = (
    name: string,
    evidence: string[],
    recommendationReason: string,
  ) => {
    const def = byName.get(name);
    if (!def || result.some((item) => item.id === name)) return;
    result.push(
      toPlaybookSurfaceItem(def, {
        evidence,
        recommendationReason,
        recommended: true,
      }),
    );
  };

  if (!latest || !latest.hasData) {
    push(
      "shopHealthCheck",
      ["暂无完整诊断快照"],
      "先生成一次经营体检，确认可用数据和需要补齐的数据源。",
    );
    return result;
  }

  const riskSkuCount = numberMetric(metrics, "riskSkuCount");
  const watchSkuCount = numberMetric(metrics, "watchSkuCount");
  const estimatedInventoryLoss = numberMetric(metrics, "estimatedInventoryLoss");
  const inventoryStatus = statusFor(latest.items, "inventory_health");
  if (riskSkuCount > 0 || watchSkuCount > 0 || inventoryStatus === "risk") {
    const lossText = estimatedInventoryLoss > 0
      ? `预计损失 ${Math.round(estimatedInventoryLoss)} ${currency}`.trim()
      : "存在库存风险";
    push(
      "inventoryRiskMitigation",
      [`高风险 SKU ${riskSkuCount}`, `关注 SKU ${watchSkuCount}`, lossText],
      "库存风险会直接影响销售承接，适合先生成补货、调拨或限流方案。",
    );
  }

  const refundRate30d = numberMetric(metrics, "refundRate30d");
  const refundRateDelta = numberMetric(metrics, "refundRateDelta");
  const refundAmount30d = numberMetric(metrics, "refundAmount30d");
  const refundStatus = statusFor(latest.items, "refund_health");
  if (refundStatus === "risk" || refundStatus === "watch" || (refundRate30d > 0 && refundRateDelta > 0)) {
    push(
      "refundIssueReview",
      [
        `30 天退款率 ${refundRate30d}%`,
        `环比 ${refundRateDelta >= 0 ? "+" : ""}${refundRateDelta}pp`,
        refundAmount30d > 0 ? `退款金额 ${Math.round(refundAmount30d)} ${currency}`.trim() : "存在退款异常",
      ],
      "退款异常需要尽快拆到 SKU、物流或售后原因，避免继续放大投放。",
    );
  }

  if (params.counts.risk > 0 || params.counts.watch > 0 || result.length === 0) {
    push(
      "shopHealthCheck",
      [`风险 ${params.counts.risk}`, `关注 ${params.counts.watch}`],
      result.length === 0
        ? "当前没有单项高风险，适合做一次整体经营体检。"
        : "先用整体体检确认各模块优先级，再决定专项处理顺序。",
    );
  }

  return result.slice(0, 3);
}

export async function getAutomationOverview(shop: string): Promise<AutomationOverview> {
  const snapshots = await prisma.operationDiagnosisSnapshot.findMany({
    where: { shop },
    orderBy: { generatedAt: "desc" },
    take: HISTORY_DAYS,
    include: {
      items: { select: { key: true, status: true } },
      _count: { select: { tasks: true } },
    },
  });

  const latest = snapshots[0] ?? null;
  const latestCounts = latest ? countByStatus(latest.items) : { risk: 0, watch: 0 };

  const configured: AutomationConfiguredItem[] = [
    {
      id: "daily-inspection",
      title: "每日经营巡检",
      schedule: "每天 · 当日首次访问经营看板时自动触发",
      lastRun: latest ? latest.generatedAt.toISOString() : null,
      status: latestCounts.risk > 0 ? "attention" : "healthy",
      outcome: latest
        ? latest.hasData
          ? `诊断 ${latest.items.length} 项（${latestCounts.risk} 项风险 / ${latestCounts.watch} 项关注），生成 ${latest._count.tasks} 条待办`
          : "店铺暂无可诊断数据（订单尚未回填）"
        : "尚未执行过巡检，打开经营看板即会触发首次诊断",
    },
  ];

  const history: AutomationHistoryItem[] = snapshots.map((snapshot) => {
    const counts = countByStatus(snapshot.items);
    return {
      id: snapshot.id,
      title: `每日经营巡检 · ${snapshot.snapshotDate}`,
      detail: snapshot.hasData
        ? `诊断 ${snapshot.items.length} 项（风险 ${counts.risk} / 关注 ${counts.watch}）· 生成待办 ${snapshot._count.tasks} 条`
        : "执行完成：店铺暂无可诊断数据",
    };
  });

  const definitions = globalPlaybookRegistry.getRegistered();
  const templates: AutomationTemplateItem[] = definitions.map((def) =>
    toPlaybookSurfaceItem(def),
  );
  const recommendedPlaybooks = buildRecommendedPlaybooks({
    definitions,
    latest: latest
      ? {
          hasData: latest.hasData,
          metrics: latest.metrics,
          items: latest.items,
        }
      : null,
    counts: latestCounts,
  });

  return { configured, history, recommendedPlaybooks, templates };
}
