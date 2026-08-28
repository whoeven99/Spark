/**
 * 经营诊断 / 待办的 zh|en 展示文案。
 * 快照库内仍以中文生成；对外展示（Health check 卡等）按 UI locale 在读取时本地化。
 */
import type { SupportedLocale } from "../../i18n/config";
import {
  CARRIER_STALE_DAYS,
  PAYMENT_SUCCESS_WATCH_PERCENT,
  SELLABLE_DAYS_RISK,
  SELLABLE_DAYS_WATCH,
  SLA_HOURS,
  type DiagnosisItemResult,
  type OperationsSummaryMetrics,
} from "./diagnosis.server";

export type OpsCopyLocale = "zh" | "en";

export function toOpsCopyLocale(locale: SupportedLocale | string | null | undefined): OpsCopyLocale {
  const raw = (locale ?? "").toLowerCase();
  if (raw === "zh" || raw.startsWith("zh-") || raw === "zh-cn") return "zh";
  return "en";
}

const DIAGNOSIS_NAMES: Record<DiagnosisItemResult["key"], { zh: string; en: string }> = {
  sales_trend: { zh: "销售趋势", en: "Sales trend" },
  traffic_anomaly: { zh: "流量波动", en: "Traffic fluctuation" },
  conversion_health: { zh: "转化率", en: "Conversion" },
  product_operations: { zh: "商品运营", en: "Product operations" },
  fulfillment_health: { zh: "履约健康", en: "Fulfillment health" },
  logistics_anomaly: { zh: "物流轨迹异常", en: "Logistics tracking issues" },
  refund_health: { zh: "退款与售后", en: "Refunds & after-sales" },
  inventory_health: { zh: "库存健康", en: "Inventory health" },
};

function pick(locale: OpsCopyLocale, zh: string, en: string): string {
  return locale === "zh" ? zh : en;
}

function metricNum(metrics: Record<string, unknown>, key: string): number | null {
  const raw = metrics[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function relatedNum(related: unknown, key: string): number | null {
  if (!related || typeof related !== "object" || Array.isArray(related)) return null;
  return metricNum(related as Record<string, unknown>, key);
}

function relatedArrayLength(related: unknown, key: string): number | null {
  if (!related || typeof related !== "object" || Array.isArray(related)) return null;
  const value = (related as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : null;
}

export function diagnosisItemName(
  key: DiagnosisItemResult["key"] | string,
  locale: OpsCopyLocale,
): string {
  const entry = DIAGNOSIS_NAMES[key as DiagnosisItemResult["key"]];
  if (!entry) return key;
  return pick(locale, entry.zh, entry.en);
}

/** 用指标重建诊断摘要（优先于库内中文 reasoning）。 */
export function diagnosisItemSummary(
  item: DiagnosisItemResult,
  locale: OpsCopyLocale,
): string {
  const m = item.metrics as Record<string, unknown>;
  const currency = typeof m.currency === "string" && m.currency ? m.currency : "USD";

  switch (item.key) {
    case "fulfillment_health": {
      const overdue = metricNum(m, "overdueOrderCount") ?? 0;
      const sla = metricNum(m, "slaHours") ?? SLA_HOURS;
      const rate = metricNum(m, "fulfillmentRate30d");
      if (overdue > 0) {
        return pick(
          locale,
          `存在 ${overdue} 单超过 ${sla} 小时未发货，按规则至少进入「关注」`,
          `${overdue} order(s) unfulfilled for over ${sla} hours — at least Watch by policy`,
        );
      }
      if (rate !== null && rate < 70) {
        return pick(
          locale,
          "无超时单，但 30 天履约率低于 70%，需要关注发货节奏",
          "No overdue orders, but 30-day fulfillment rate is below 70% — watch shipping pace",
        );
      }
      return pick(locale, "无超时未发货订单，履约健康", "No overdue unfulfilled orders — fulfillment looks healthy");
    }
    case "logistics_anomaly": {
      const failure = metricNum(m, "deliveryFailureCount") ?? 0;
      const stale = metricNum(m, "staleTrackingCount") ?? 0;
      const staleDays = metricNum(m, "carrierStaleDays") ?? CARRIER_STALE_DAYS;
      if (failure > 0) {
        return pick(
          locale,
          `存在 ${failure} 单投递失败/异常，客户体验风险显著上升`,
          `${failure} shipment(s) failed or abnormal — customer experience risk is rising`,
        );
      }
      if (stale > 0) {
        return pick(
          locale,
          `存在 ${stale} 单在途超过 ${staleDays} 天无新轨迹，承运商时效或轨迹同步存在风险`,
          `${stale} in-transit shipment(s) with no tracking update for over ${staleDays} days`,
        );
      }
      return pick(locale, "未发现轨迹停滞或投递失败", "No stale tracking or delivery failures found");
    }
    case "refund_health": {
      const rate = metricNum(m, "refundRate30d");
      const delta = metricNum(m, "refundRateDelta");
      if (item.status === "risk" && rate !== null) {
        return pick(
          locale,
          `退款率 ${rate}% 超过告警线且环比上升，退款风险上升`,
          `Refund rate ${rate}% is above the alert line and rising — refund risk is up`,
        );
      }
      if (item.status === "watch") {
        return pick(
          locale,
          "退款率偏高或环比明显上升，需要复盘退款原因",
          "Refund rate is elevated or rising — review refund drivers",
        );
      }
      if (rate !== null && delta !== null) {
        return pick(
          locale,
          `退款率处于正常区间（${rate}%，环比 ${delta >= 0 ? "+" : ""}${delta}pp）`,
          `Refund rate is in a normal range (${rate}%, Δ ${delta >= 0 ? "+" : ""}${delta}pp)`,
        );
      }
      return pick(locale, "退款率处于正常区间", "Refund rate is in a normal range");
    }
    case "inventory_health": {
      const risk = metricNum(m, "riskSkuCount") ?? 0;
      const watch = metricNum(m, "watchSkuCount") ?? 0;
      const loss = metricNum(m, "estimatedInventoryLoss");
      if (risk > 0) {
        return pick(
          locale,
          `${risk} 个高动销 SKU 缺货或可售天数不足 ${SELLABLE_DAYS_RISK} 天` +
            (loss !== null ? `，预计未来 7 天损失 ${loss} ${currency}` : ""),
          `${risk} high-velocity SKU(s) OOS or under ${SELLABLE_DAYS_RISK} sellable days` +
            (loss !== null ? `; est. 7-day loss ${loss} ${currency}` : ""),
        );
      }
      if (watch > 0) {
        return pick(
          locale,
          `${watch} 个 SKU 可售天数低于 ${SELLABLE_DAYS_WATCH} 天，需关注补货节奏`,
          `${watch} SKU(s) under ${SELLABLE_DAYS_WATCH} sellable days — plan replenishment`,
        );
      }
      return pick(
        locale,
        "有销量 SKU 的库存可支撑当前销售速度",
        "Sellable inventory can support current sales velocity",
      );
    }
    case "product_operations": {
      const draft = metricNum(m, "draftProductCount") ?? 0;
      const noImages = metricNum(m, "noImagesProductCount") ?? 0;
      const noDesc = metricNum(m, "noDescriptionProductCount") ?? 0;
      if (draft > 5) {
        return pick(
          locale,
          `有 ${draft} 个商品仍处于草稿（DRAFT）状态，占用库存但未上架，优先复盘上新卡点`,
          `${draft} products are still DRAFT — review launch blockers first`,
        );
      }
      if (draft > 0) {
        return pick(
          locale,
          `有 ${draft} 个商品草稿待上架，需要复盘上新流程并完成审核发布`,
          `${draft} draft product(s) awaiting publish — review the launch flow`,
        );
      }
      if (noImages > 0) {
        return pick(
          locale,
          `${noImages} 个商品缺少图片，影响转化率，需补充视觉素材`,
          `${noImages} product(s) missing images — add visual assets`,
        );
      }
      if (noDesc > 0) {
        return pick(
          locale,
          `${noDesc} 个商品缺少描述，提高买家疑虑风险`,
          `${noDesc} product(s) missing descriptions — reduce buyer uncertainty`,
        );
      }
      return pick(locale, "商品信息完整度良好，无待处理项", "Product completeness looks good — nothing pending");
    }
    case "sales_trend": {
      const growth = metricNum(m, "salesGrowthRate");
      if (growth !== null && growth < -20) {
        return pick(
          locale,
          "近 7 天销售额大幅下滑，需结合渠道数据进一步归因",
          "Sales over the last 7 days dropped sharply — attribute by channel next",
        );
      }
      if (growth !== null && growth < -5) {
        return pick(
          locale,
          "近 7 天销售额低于上一周期，需结合渠道数据进一步归因",
          "Sales over the last 7 days are below the prior period — dig into channel drivers",
        );
      }
      if (growth === null) {
        return pick(
          locale,
          "上一周期无销售额，无法计算环比，仅观察当前周期绝对值",
          "No prior-period sales baseline — watch absolute values only",
        );
      }
      if (growth >= 5) {
        return pick(
          locale,
          "近 7 天销售额环比增长 ≥ 5%，销售趋势健康",
          "Sales grew ≥5% vs prior 7 days — trend looks healthy",
        );
      }
      return pick(locale, "近 7 天销售额环比基本持平", "Sales over the last 7 days are roughly flat");
    }
    case "traffic_anomaly": {
      const change = metricNum(m, "trafficChangeRate");
      if (change !== null && change < -20) {
        return pick(
          locale,
          "会话数明显下滑，优先排查各获客渠道（广告/自然搜索/社媒）流量来源",
          "Sessions dropped sharply — check acquisition channels (ads / SEO / social) first",
        );
      }
      if (change === null) {
        return pick(
          locale,
          "无上一周期会话基线，仅观察当前周期绝对值",
          "No prior-period session baseline — watch absolute values only",
        );
      }
      if (change >= 5) {
        return pick(locale, "近 7 天会话数环比增长，流量健康", "Sessions grew vs prior 7 days — traffic looks healthy");
      }
      return pick(locale, "近 7 天会话数环比基本持平", "Sessions over the last 7 days are roughly flat");
    }
    case "conversion_health": {
      const payRate = metricNum(m, "paymentSuccessRate");
      if (payRate !== null && payRate < PAYMENT_SUCCESS_WATCH_PERCENT) {
        return pick(
          locale,
          `支付成功率 ${payRate}%（目标 ≥ ${PAYMENT_SUCCESS_WATCH_PERCENT}%），需关注支付流程`,
          `Payment success rate ${payRate}% (target ≥ ${PAYMENT_SUCCESS_WATCH_PERCENT}%) — review checkout`,
        );
      }
      if (item.status !== "healthy") {
        return pick(
          locale,
          "会话转化率下滑，优先排查商品页、价格、运费与支付链路",
          "Session conversion slipped — check PDP, pricing, shipping, and payment",
        );
      }
      return pick(locale, "转化漏斗各环节环比稳定", "Conversion funnel stages look stable vs prior period");
    }
    default: {
      const _exhaustive: never = item.key;
      void _exhaustive;
      const fallback = item.reasoning[0] ?? item.evidence[0] ?? diagnosisItemName(item.key, locale);
      return locale === "zh" ? fallback : diagnosisItemName(item.key, locale);
    }
  }
}

type TaskCopyInput = {
  sourceKey: string;
  title: string;
  triggerReason: string;
  relatedObjects?: unknown;
  priority?: string;
  quadrant?: string;
};

/** 按规则 sourceKey + 指标重建待办标题与触发原因。 */
export function localizeOperationTaskCopy(
  task: TaskCopyInput,
  metrics: OperationsSummaryMetrics,
  locale: OpsCopyLocale,
): { title: string; triggerReason: string } {
  if (locale === "zh") {
    return { title: task.title, triggerReason: task.triggerReason };
  }

  const related = task.relatedObjects;
  const overdue = metrics.overdueOrderCount;
  const riskSku = metrics.riskSkuCount;
  const watchSku = metrics.watchSkuCount;
  const currency = metrics.currency || "USD";

  switch (task.sourceKey) {
    case "fulfillment_overdue":
      return {
        title: `Clear ${overdue} overdue unfulfilled order(s)`,
        triggerReason: `${overdue} order(s) still unfulfilled after ${SLA_HOURS} hours — fulfillment SLA breached`,
      };
    case "logistics_stale": {
      const stale =
        relatedNum(related, "staleTrackingCount") ??
        relatedArrayLength(related, "shipments") ??
        metrics.carrierIssueCount;
      return {
        title: `Follow up ${stale} logistics tracking issue(s)`,
        triggerReason: `${stale} shipment(s) have stale tracking (>${CARRIER_STALE_DAYS} days) or delivery failures`,
      };
    }
    case "refund_spike": {
      const sign = metrics.refundRateDelta >= 0 ? "+" : "";
      return {
        title: "Review drivers of the refund spike",
        triggerReason: `30-day refund rate ${metrics.refundRate30d}% (Δ ${sign}${metrics.refundRateDelta}pp) — refund risk is rising`,
      };
    }
    case "after_sales_timeout": {
      const count =
        relatedNum(related, "abnormalRefundOrderCount") ??
        relatedArrayLength(related, "abnormalOrders") ??
        0;
      const isRisk = task.priority === "P0" || task.quadrant === "q1";
      return {
        title: isRisk
          ? `Prioritize ${count} high-risk after-sales case(s)`
          : `Follow up ${count} abnormal after-sales case(s)`,
        triggerReason: `${count} refund(s) look high-value or multi-item — treat as after-sales backlog signal`,
      };
    }
    case "inventory_risk":
      return {
        title: `Restock ${riskSku} high-velocity SKU(s) to stop loss`,
        triggerReason: `${riskSku} SKU(s) OOS or under ${SELLABLE_DAYS_RISK} sellable days; est. 7-day loss ${metrics.estimatedInventoryLoss} ${currency}`,
      };
    case "payment_chain_review": {
      const isRisk = task.priority === "P0" || task.quadrant === "q1";
      const successRate = relatedNum(related, "paymentSuccessRate");
      const failures = relatedNum(related, "paymentFailures") ?? 0;
      return {
        title: isRisk ? "Investigate payment-chain failures now" : "Review payment chain and failed checkouts",
        triggerReason: [
          successRate !== null
            ? `Order payment success ${successRate}% (target ≥ ${PAYMENT_SUCCESS_WATCH_PERCENT}%)`
            : null,
          failures > 0 ? `${failures} payment attempt(s) failed` : null,
        ]
          .filter(Boolean)
          .join("; ") || "Payment chain needs review",
      };
    }
    case "sales_decline": {
      const isRisk = task.priority === "P1" && task.quadrant === "q1";
      return {
        title: isRisk ? "Investigate the sharp sales drop" : "Follow the sales decline trend",
        triggerReason: `Last-7-day sales ${metrics.salesAmount7d} ${currency}, Δ ${metrics.salesGrowthRate}%`,
      };
    }
    case "traffic_conversion_drop": {
      const parts = [
        metrics.trafficChangeRate !== null
          ? `Sessions Δ ${metrics.trafficChangeRate}% over 7 days`
          : null,
        metrics.conversionRate7d !== null
          ? `Session conversion ${metrics.conversionRate7d}% (prior ${metrics.conversionRatePrev7d ?? "—"})`
          : null,
      ].filter(Boolean);
      const both = Boolean(
        metrics.trafficChangeRate !== null && metrics.conversionRate7d !== null,
      );
      return {
        title: both
          ? "Investigate traffic and conversion dropping together"
          : metrics.trafficChangeRate !== null
            ? "Investigate the traffic drop"
            : "Investigate the conversion drop",
        triggerReason: parts.join("; ") || "Traffic or conversion funnel slipped",
      };
    }
    case "routine_shipping": {
      const count =
        relatedArrayLength(related, "orders") ??
        Math.max(0, metrics.pendingOrderCount - metrics.overdueOrderCount);
      return {
        title: `Routine shipping: ${count} order(s) awaiting fulfillment (not overdue)`,
        triggerReason: `${count} order(s) still within the ${SLA_HOURS}h SLA — ship in batch before they go overdue`,
      };
    }
    case "launch_failure_review": {
      const draft = relatedNum(related, "draftCount") ?? metrics.draftProductCount;
      const noImages = relatedNum(related, "noImagesCount") ?? metrics.noImagesProductCount;
      const noDesc =
        relatedNum(related, "noDescriptionCount") ?? metrics.noDescriptionProductCount;
      const isRisk = task.priority === "P0" || task.quadrant === "q1";
      const blockers = [
        `${draft} product(s) still draft / unpublished`,
        noImages > 0 ? `${noImages} product(s) missing images` : null,
        noDesc > 0 ? `${noDesc} product(s) missing descriptions` : null,
      ].filter(Boolean);
      return {
        title: isRisk
          ? "Review failed launches and unpublished products now"
          : "Review launch blockers and unpublished products",
        triggerReason: blockers.join("; "),
      };
    }
    case "product_incomplete": {
      const draft = relatedNum(related, "draftCount") ?? metrics.draftProductCount;
      const noImages = relatedNum(related, "noImagesCount") ?? metrics.noImagesProductCount;
      const noDesc =
        relatedNum(related, "noDescriptionCount") ?? metrics.noDescriptionProductCount;
      const total = draft + noImages + noDesc;
      const issues = [
        draft > 0 ? `${draft} draft product(s) awaiting publish` : null,
        noImages > 0 ? `${noImages} product(s) missing images` : null,
        noDesc > 0 ? `${noDesc} product(s) missing descriptions` : null,
      ].filter(Boolean);
      return {
        title: total > 0 ? `Fix ${total} product completeness issue(s)` : "Improve product completeness",
        triggerReason: issues.join("; ") || "Product information gaps detected",
      };
    }
    case "inventory_replenish_plan":
      return {
        title: `Plan replenishment for ${watchSku} SKU(s) this week`,
        triggerReason: `${watchSku} SKU(s) have ${SELLABLE_DAYS_RISK}-${SELLABLE_DAYS_WATCH} sellable days — not urgent yet, schedule replenishment`,
      };
    default:
      return { title: task.title, triggerReason: task.triggerReason };
  }
}
