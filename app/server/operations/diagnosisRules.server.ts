import type { OperationsDiagnosis } from "./diagnosis.server";
import {
  CARRIER_STALE_DAYS,
  PAYMENT_SUCCESS_RISK_PERCENT,
  PAYMENT_SUCCESS_WATCH_PERCENT,
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
 * 阶段一覆盖：超时履约、物流异常、退款异常、售后超时处理、库存止损、常规发货、
 * 支付链路排查、销售趋势、流量/转化异常止损（工作流 5，依赖 Web Pixel 漏斗数据）。
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
    key: "after_sales_timeout",
    evaluate: (d) => {
      const item = findItem(d, "refund_health");
      if (!item || item.status === "healthy") return null;

      const abnormalOrders = d.detail.abnormalRefundOrders;
      if (abnormalOrders.length <= 0) return null;

      const isRisk = item.status === "risk" || abnormalOrders.length >= 3;
      const topReasons = Array.from(
        new Set(abnormalOrders.map((order) => order.reason).filter(Boolean)),
      ).slice(0, 3);

      return {
        sourceKey: "after_sales_timeout",
        dedupeKey: "after_sales_timeout",
        title: isRisk
          ? `优先处理 ${abnormalOrders.length} 单高风险售后单`
          : `跟进 ${abnormalOrders.length} 单异常售后单`,
        quadrant: isRisk ? "q1" : "q2",
        priority: isRisk ? "P0" : "P1",
        triggerReason: [
          `${abnormalOrders.length} 单退款金额偏高或涉及多件商品`,
          topReasons.length > 0 ? `主要原因：${topReasons.join(" / ")}` : null,
          "当前未接入客服响应 SLA，先用异常退款单作为售后超时代理信号",
        ]
          .filter(Boolean)
          .join("；"),
        relatedObjects: {
          abnormalOrders,
          abnormalRefundOrderCount: abnormalOrders.length,
          refundRate30d: item.metrics.refundRate30d ?? null,
          refundRateDelta: item.metrics.refundRateDelta ?? null,
        },
        suggestedActions: [
          "按退款金额和退款时间排序，优先处理高金额且原因集中的售后单",
          "把商品问题、履约问题和售后响应问题拆开复盘，避免混成同一种异常",
          "对重复出现的退款原因补齐标准回复与处理动作，避免售后继续积压",
        ],
        ownerRole: "售后/客服",
        dueWindow: isRisk ? "today" : "48h",
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
    key: "payment_chain_review",
    evaluate: (d) => {
      const item = findItem(d, "conversion_health");
      const successRate = Number(item?.metrics.paymentSuccessRate ?? NaN);
      const attempts = Number(item?.metrics.paymentAttempts ?? 0);
      const successful = Number(item?.metrics.paymentSuccessful ?? 0);
      const paymentRate = Number(item?.metrics.paymentRate ?? NaN);
      const shouldCreate =
        (Number.isFinite(successRate) && successRate < PAYMENT_SUCCESS_WATCH_PERCENT) ||
        attempts > successful;
      if (!item || !shouldCreate) return null;

      const isRisk =
        Number.isFinite(successRate) && successRate < PAYMENT_SUCCESS_RISK_PERCENT;
      const failureCount = Math.max(attempts - successful, 0);

      return {
        sourceKey: "payment_chain_review",
        dedupeKey: "payment_chain_review",
        title: isRisk ? "立即排查支付链路异常" : "复核支付链路与失败订单",
        quadrant: isRisk ? "q1" : "q2",
        priority: isRisk ? "P0" : "P1",
        triggerReason: [
          Number.isFinite(successRate)
            ? `订单支付成功率 ${successRate}%（目标 ≥ ${PAYMENT_SUCCESS_WATCH_PERCENT}%）`
            : null,
          failureCount > 0 ? `${failureCount} 笔支付尝试未成功` : null,
          Number.isFinite(paymentRate) ? `结账末端支付成功率 ${paymentRate}%` : null,
        ]
          .filter(Boolean)
          .join("；"),
        relatedObjects: {
          paymentSuccessRate: Number.isFinite(successRate) ? successRate : null,
          paymentAttempts: attempts,
          paymentSuccessful: successful,
          paymentFailures: failureCount,
          checkoutPaymentRate: Number.isFinite(paymentRate) ? paymentRate : null,
          evidence: item.evidence,
        },
        suggestedActions: Array.from(
          new Set([
            "先按设备、支付方式和地区拆开失败订单，确认是否集中在单一场景",
            "复核移动端结账页、支付回跳链路和最近的支付配置改动",
            ...item.reasoning.filter((reason) => reason.includes("支付") || reason.includes("结账")),
          ]),
        ),
        ownerRole: "运营/支付",
        dueWindow: isRisk ? "today" : "48h",
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
  // ── Q2 和 Q3 交界：商品问题（可快速处理）──
  {
    key: "launch_failure_review",
    evaluate: (d) => {
      const item = findItem(d, "product_operations");
      if (!item || item.status === "healthy") return null;
      const draftCount = Number(item.metrics.draftProductCount ?? 0);
      const noImagesCount = Number(item.metrics.noImagesProductCount ?? 0);
      const noDescCount = Number(item.metrics.noDescriptionProductCount ?? 0);
      if (draftCount <= 0) return null;

      const isRisk = draftCount > 5 || item.status === "risk";
      const blockers: string[] = [`${draftCount} 个商品仍处于草稿待上架`];
      if (noImagesCount > 0) blockers.push(`${noImagesCount} 个商品缺图`);
      if (noDescCount > 0) blockers.push(`${noDescCount} 个商品缺描述`);

      return {
        sourceKey: "launch_failure_review",
        dedupeKey: "launch_failure_review",
        title: isRisk ? "立即复盘上新失败与待上架商品" : "复盘上新卡点与待上架商品",
        quadrant: isRisk ? "q1" : "q2",
        priority: isRisk ? "P0" : "P1",
        triggerReason: blockers.join("；"),
        relatedObjects: {
          draftCount,
          noImagesCount,
          noDescriptionCount: noDescCount,
          evidence: item.evidence,
        },
        suggestedActions: Array.from(
          new Set([
            "先按计划主推商品优先级排队，确认哪些新品本应今日上架却仍停在草稿",
            "逐个复核上架阻塞点：审核、定价、图片、描述和发布流程",
            "对已确定要上的商品，先补齐最低可上线素材，再安排正式发布",
            ...item.reasoning.filter((reason) => reason.includes("上新") || reason.includes("草稿")),
          ]),
        ),
        ownerRole: "商品/运营",
        dueWindow: isRisk ? "today" : "48h",
      };
    },
  },
  {
    key: "product_incomplete",
    evaluate: (d) => {
      const item = findItem(d, "product_operations");
      if (!item || item.status === "healthy") return null;
      const draftCount = Number(item.metrics.draftProductCount ?? 0);
      const noImagesCount = Number(item.metrics.noImagesProductCount ?? 0);
      const noDescCount = Number(item.metrics.noDescriptionProductCount ?? 0);
      const total = draftCount + noImagesCount + noDescCount;
      if (total === 0) return null;

      const isRisk = draftCount > 5 || item.status === "risk";
      const issues: string[] = [];
      if (draftCount > 0)
        issues.push(
          `${draftCount} 个商品草稿待上架`,
        );
      if (noImagesCount > 0)
        issues.push(
          `${noImagesCount} 个商品缺图`,
        );
      if (noDescCount > 0)
        issues.push(
          `${noDescCount} 个商品缺描述`,
        );

      return {
        sourceKey: "product_incomplete",
        dedupeKey: "product_incomplete",
        title:
          total > 0
            ? `处理 ${total} 个商品信息不完整问题`
            : "优化商品信息完整度",
        quadrant: isRisk ? "q2" : "q3",
        priority: isRisk ? "P1" : "P2",
        triggerReason: issues.join("；"),
        relatedObjects: {
          draftCount,
          noImagesCount,
          noDescriptionCount: noDescCount,
          samples: item.metrics,
        },
        suggestedActions: [
          draftCount > 0 ? "完成 DRAFT 商品审核与发布" : null,
          noImagesCount > 0
            ? "通过 AI 生成或商品优化工具补充缺失图片"
            : null,
          noDescCount > 0 ? "批量生成或补充商品描述" : null,
          "运行商品改进任务完成素材补充",
        ].filter(Boolean) as string[],
        ownerRole: "商品/运营",
        dueWindow: isRisk ? "today" : "this_week",
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

export const RULE_MANAGED_SOURCE_KEYS = RULES.map((rule) => rule.key);

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
