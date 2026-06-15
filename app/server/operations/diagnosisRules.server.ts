import type { OperationsDiagnosis } from "./diagnosis.server";
import {
  CARRIER_STALE_DAYS,
  REFUND_RATE_WATCH_PERCENT,
  REFUND_SPIKE_PERCENT_POINTS,
  SELLABLE_DAYS_RISK,
  SELLABLE_DAYS_WATCH,
  SLA_HOURS,
} from "./diagnosis.server";

/**
 * 诊断 → 任务转换规则（docs/DAILY_OPERATIONS_WORKFLOWS.md §9 首批规则）。
 *
 * 规则以声明式数组组织，后续可平移到数据库规则表。
 * 阶段一覆盖：超时履约、物流异常、退款异常、库存止损、常规发货、销售趋势、
 * 流量/转化异常止损（工作流 5，依赖 Web Pixel 漏斗数据）。
 */

export type TaskQuadrant = "q1" | "q2" | "q3" | "q4";
export type TaskPriority = "P0" | "P1" | "P2";
export type TaskDueWindow = "today" | "48h" | "this_week" | "backlog";

export type GeneratedTask = {
  /** 规则键，对应文档 diagnosisKey */
  sourceKey: string;
  /** 同一问题去重键（open/in_progress 状态下唯一） */
  dedupeKey: string;
  title: string;
  quadrant: TaskQuadrant;
  priority: TaskPriority;
  triggerReason: string;
  relatedObjects: unknown;
  suggestedActions: string[];
  ownerRole: string;
  dueWindow: TaskDueWindow;
};

type RuleDefinition = {
  key: string;
  evaluate: (d: OperationsDiagnosis) => GeneratedTask | null;
};

function findItem(d: OperationsDiagnosis, key: string) {
  return d.items.find((item) => item.key === key);
}

const RULES: RuleDefinition[] = [
  // ── Q1 紧急重要 ──────────────────────────────
  {
    key: "fulfillment_overdue",
    evaluate: (d) => {
      const count = d.summaryMetrics.overdueOrderCount;
      if (count <= 0) return null;
      return {
        sourceKey: "fulfillment_overdue",
        dedupeKey: "fulfillment_overdue",
        title: `处理 ${count} 单超时未发货订单`,
        quadrant: "q1",
        priority: "P0",
        triggerReason: `${count} 单订单创建超过 ${SLA_HOURS} 小时仍未发货，已触及履约 SLA 红线`,
        relatedObjects: { orders: d.detail.overdueOrders },
        suggestedActions: [
          "按订单年龄从老到新优先处理发货",
          "核对仓库/供应商缺货原因，无法发货的主动联系客户",
          "高客单或已催单客户优先安抚，避免升级为投诉与退款",
        ],
        ownerRole: "履约/仓储",
        dueWindow: "today",
      };
    },
  },
  {
    key: "logistics_stale",
    evaluate: (d) => {
      const item = findItem(d, "logistics_anomaly");
      const stale = Number(item?.metrics.staleTrackingCount ?? 0);
      const failure = Number(item?.metrics.deliveryFailureCount ?? 0);
      if (stale + failure <= 0) return null;
      return {
        sourceKey: "logistics_stale",
        dedupeKey: "logistics_stale",
        title: `跟进 ${stale + failure} 单物流轨迹异常`,
        quadrant: "q1",
        priority: "P0",
        triggerReason: [
          stale > 0 ? `${stale} 单在途超过 ${CARRIER_STALE_DAYS} 天无轨迹更新` : null,
          failure > 0 ? `${failure} 单投递失败/异常` : null,
        ]
          .filter(Boolean)
          .join("，"),
        relatedObjects: { shipments: d.detail.carrierIssues },
        suggestedActions: [
          "向承运商发起轨迹核查，确认包裹是否丢失",
          "投递失败订单联系客户确认地址后安排二次投递或补发",
          "异常集中在单一承运商时评估切换渠道",
        ],
        ownerRole: "履约/客服",
        dueWindow: "today",
      };
    },
  },
  {
    key: "refund_spike",
    evaluate: (d) => {
      const m = d.summaryMetrics;
      if (
        !(
          m.refundRate30d > REFUND_RATE_WATCH_PERCENT && m.refundRateDelta > 0
        ) &&
        !(m.refundRateDelta > REFUND_SPIKE_PERCENT_POINTS)
      ) {
        return null;
      }
      return {
        sourceKey: "refund_spike",
        dedupeKey: "refund_spike",
        title: "复盘退款异常上升原因",
        quadrant: "q1",
        priority: "P1",
        triggerReason: `30 天退款率 ${m.refundRate30d}%（环比 ${m.refundRateDelta >= 0 ? "+" : ""}${m.refundRateDelta}pp），退款风险上升`,
        relatedObjects: {
          topRefundSkus: d.detail.topRefundSkus,
          abnormalOrders: d.detail.abnormalRefundOrders,
        },
        suggestedActions: [
          "按 Top 退款 SKU 排查商品质量与描述不符问题",
          "区分商品 / 物流 / 售后响应三类根因，修正商品页或物流策略",
          "对高额退款订单逐单复核，必要时启动质检",
        ],
        ownerRole: "运营/售后",
        dueWindow: "48h",
      };
    },
  },
  {
    key: "inventory_risk",
    evaluate: (d) => {
      const m = d.summaryMetrics;
      if (m.riskSkuCount <= 0) return null;
      const riskSkus = d.detail.inventoryRisks.filter((i) => i.risk === "risk");
      return {
        sourceKey: "inventory_risk",
        dedupeKey: "inventory_risk",
        title: `为 ${m.riskSkuCount} 个高动销 SKU 补货止损`,
        quadrant: "q1",
        priority: "P0",
        triggerReason: `${m.riskSkuCount} 个 SKU 缺货或可售天数不足 ${SELLABLE_DAYS_RISK} 天，预估未来 7 天损失 ${m.estimatedInventoryLoss} ${m.currency}`,
        relatedObjects: { skus: riskSkus },
        suggestedActions: [
          "按预估损失从高到低安排补货或仓间调拨",
          "短期无法补货的 SKU 暂停广告投放或限量销售",
          "评估替代 SKU 承接需求",
        ],
        ownerRole: "供应链/采购",
        dueWindow: "today",
      };
    },
  },
  {
    key: "sales_decline",
    evaluate: (d) => {
      const item = findItem(d, "sales_trend");
      if (!item || item.status === "healthy") return null;
      const m = d.summaryMetrics;
      const isRisk = item.status === "risk";
      return {
        sourceKey: "sales_decline",
        dedupeKey: "sales_decline",
        title: isRisk ? "排查销售额大幅下滑原因" : "跟进销售额下滑趋势",
        quadrant: isRisk ? "q1" : "q3",
        priority: isRisk ? "P1" : "P2",
        triggerReason: `近 7 天销售额 ${m.salesAmount7d} ${m.currency}，环比 ${m.salesGrowthRate}%`,
        relatedObjects: {
          salesAmount7d: m.salesAmount7d,
          salesAmountPrev7d: m.salesAmountPrev7d,
          orderCount7d: m.orderCount7d,
          orderCountPrev7d: m.orderCountPrev7d,
          aov7d: m.aov7d,
          aovPrev7d: m.aovPrev7d,
        },
        suggestedActions: [
          ...item.reasoning,
          "先区分流量下滑还是转化下滑，再定位渠道 / 商品 / 支付环节",
        ],
        ownerRole: "运营",
        dueWindow: isRisk ? "today" : "this_week",
      };
    },
  },
  {
    key: "traffic_conversion_drop",
    evaluate: (d) => {
      const traffic = findItem(d, "traffic_anomaly");
      const conversion = findItem(d, "conversion_health");
      const trafficBad = traffic && traffic.status !== "healthy";
      const conversionBad = conversion && conversion.status !== "healthy";
      if (!trafficBad && !conversionBad) return null;
      const isRisk =
        traffic?.status === "risk" || conversion?.status === "risk";
      const m = d.summaryMetrics;
      const reasonParts = [
        trafficBad && m.trafficChangeRate !== null
          ? `近 7 天会话数环比 ${m.trafficChangeRate}%`
          : null,
        conversionBad && m.conversionRate7d !== null
          ? `会话转化率 ${m.conversionRate7d}%（上期 ${m.conversionRatePrev7d ?? "—"}%）`
          : null,
      ].filter(Boolean);
      // 推理结论合并去重（来自流量/转化两项的归因建议）。
      const actions = Array.from(
        new Set([
          ...(traffic?.reasoning ?? []),
          ...(conversion?.reasoning ?? []),
          "先区分流量端还是站内转化问题，再定位渠道 / 商品页 / 支付链路",
        ]),
      );
      return {
        sourceKey: "traffic_conversion_drop",
        dedupeKey: "traffic_conversion_drop",
        title: trafficBad && conversionBad
          ? "排查流量与转化同步下滑"
          : trafficBad
            ? "排查流量异常下滑"
            : "排查转化率下滑",
        quadrant: isRisk ? "q1" : "q3",
        priority: isRisk ? "P1" : "P2",
        triggerReason: reasonParts.join("；") || "流量或转化漏斗出现下滑",
        relatedObjects: {
          sessions7d: m.sessions7d,
          sessionsPrev7d: m.sessionsPrev7d,
          trafficChangeRate: m.trafficChangeRate,
          conversionRate7d: m.conversionRate7d,
          conversionRatePrev7d: m.conversionRatePrev7d,
          trafficMetrics: traffic?.metrics ?? null,
          conversionMetrics: conversion?.metrics ?? null,
        },
        suggestedActions: actions,
        ownerRole: "运营/投放",
        dueWindow: isRisk ? "today" : "this_week",
      };
    },
  },
  // ── Q2 紧急不重要 ────────────────────────────
  {
    key: "routine_shipping",
    evaluate: (d) => {
      const item = findItem(d, "fulfillment_health");
      const count = Number(item?.metrics.routineUnfulfilledCount ?? 0);
      if (count <= 0) return null;
      return {
        sourceKey: "routine_shipping",
        dedupeKey: "routine_shipping",
        title: `常规发货：${count} 单待发货（未超时）`,
        quadrant: "q2",
        priority: "P1",
        triggerReason: `${count} 单订单在 ${SLA_HOURS} 小时 SLA 内待发货，建议批量处理避免转为超时单`,
        relatedObjects: { orders: d.detail.routineUnfulfilledOrders },
        suggestedActions: ["按下单时间批量打单发货", "发货后批量回传运单号"],
        ownerRole: "履约/仓储",
        dueWindow: "today",
      };
    },
  },
  // ── Q3 不紧急重要 ────────────────────────────
  {
    key: "inventory_replenish_plan",
    evaluate: (d) => {
      const m = d.summaryMetrics;
      if (m.watchSkuCount <= 0) return null;
      const watchSkus = d.detail.inventoryRisks.filter((i) => i.risk === "watch");
      return {
        sourceKey: "inventory_replenish_plan",
        dedupeKey: "inventory_replenish_plan",
        title: `制定 ${m.watchSkuCount} 个 SKU 的本周补货计划`,
        quadrant: "q3",
        priority: "P2",
        triggerReason: `${m.watchSkuCount} 个 SKU 可售天数在 ${SELLABLE_DAYS_RISK}-${SELLABLE_DAYS_WATCH} 天之间，尚未紧急但需提前排产`,
        relatedObjects: { skus: watchSkus },
        suggestedActions: [
          "结合供应商交期确定补货批次与数量",
          "对动销加速的 SKU 提高安全库存水位",
        ],
        ownerRole: "供应链/采购",
        dueWindow: "this_week",
      };
    },
  },
];

/** 计算 dueWindow 对应的截止时间。 */
export function dueWindowToDate(window: TaskDueWindow, now: Date): Date | null {
  switch (window) {
    case "today":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "48h":
      return new Date(now.getTime() + 48 * 60 * 60 * 1000);
    case "this_week":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "backlog":
      return null;
  }
}

/** 对一份诊断结果运行全部规则，返回应存在的任务集合。 */
export function evaluateDiagnosisRules(
  diagnosis: OperationsDiagnosis,
): GeneratedTask[] {
  if (!diagnosis.hasData) return [];
  const tasks: GeneratedTask[] = [];
  for (const rule of RULES) {
    const task = rule.evaluate(diagnosis);
    if (task) tasks.push(task);
  }
  return tasks;
}
