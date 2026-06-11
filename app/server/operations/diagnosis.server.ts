import prisma from "../../db.server";

/**
 * 每日经营诊断计算层（docs/DAILY_OPERATIONS_WORKFLOWS.md §7 / §10.1）。
 *
 * 纯计算：从已同步的 Shop* 表读取数据，输出结构化诊断项（含证据/公式/推理链），
 * 不落库、不生成任务。落库与任务化见 dailyInspection.server.ts / diagnosisRules.server.ts。
 */

// ──────────────────────────────────────────────
// 阈值（与 app.order-monitor.tsx 口径保持一致）
// ──────────────────────────────────────────────

export const SLA_HOURS = 48;
export const CARRIER_STALE_DAYS = 7;
/** 退款率环比上升超过该百分点视为退款异常上升 */
export const REFUND_SPIKE_PERCENT_POINTS = 3;
/** 退款率绝对值告警线（%） */
export const REFUND_RATE_WATCH_PERCENT = 5;
export const REFUND_RATE_RISK_PERCENT = 10;
/** 可售天数低于该值视为高风险 SKU */
export const SELLABLE_DAYS_RISK = 7;
export const SELLABLE_DAYS_WATCH = 14;
/** 7 天销售额环比下滑超过该比例（%）进入关注/风险 */
export const SALES_DECLINE_WATCH_PERCENT = -5;
export const SALES_DECLINE_RISK_PERCENT = -20;

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

export type DiagnosisStatus = "healthy" | "watch" | "risk";

export type DiagnosisKey =
  | "sales_trend"
  | "fulfillment_health"
  | "logistics_anomaly"
  | "refund_health"
  | "inventory_health";

export type DiagnosisItemResult = {
  key: DiagnosisKey;
  name: string;
  status: DiagnosisStatus;
  metrics: Record<string, number | string | null>;
  evidence: string[];
  reasoning: string[];
  formulas: string[];
};

export type OverdueOrderDetail = {
  orderNumber: string;
  ageHours: number;
  fulfillmentStatus: string;
  customer: string;
};

export type CarrierIssueDetail = {
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  shipmentStatus: string;
  ageDays: number;
};

export type InventoryRiskDetail = {
  sku: string;
  title: string;
  variantTitle: string;
  available: number;
  dailySalesVelocity: number;
  /** null 表示无销量（可售天数无穷大） */
  sellableDays: number | null;
  estimatedLoss: number;
  risk: Exclude<DiagnosisStatus, "healthy">;
};

export type TopRefundSkuDetail = {
  sku: string;
  title: string;
  quantity: number;
  amount: number;
  reason: string;
};

export type AbnormalRefundOrderDetail = {
  orderNumber: string;
  amount: number;
  /** 退款额占订单额比例（%），订单金额缺失时为 null */
  rate: number | null;
  reason: string;
  skus: string;
  processedAt: string;
};

export type OperationsSummaryMetrics = {
  orderCount30d: number;
  revenue30d: number;
  aov30d: number;
  cancelRate30d: number;
  refundAmount30d: number;
  refundRate30d: number;
  refundRatePrev30d: number;
  refundRateDelta: number;
  fulfillmentRate30d: number;
  averageFulfillmentHours: number;
  salesAmount7d: number;
  salesAmountPrev7d: number;
  salesGrowthRate: number | null;
  orderCount7d: number;
  orderCountPrev7d: number;
  aov7d: number;
  aovPrev7d: number;
  pendingOrderCount: number;
  overdueOrderCount: number;
  carrierIssueCount: number;
  riskSkuCount: number;
  watchSkuCount: number;
  estimatedInventoryLoss: number;
  currency: string;
};

export type OperationsDiagnosis = {
  shop: string;
  generatedAt: string;
  hasData: boolean;
  totalOrdersAllTime: number;
  summaryMetrics: OperationsSummaryMetrics;
  items: DiagnosisItemResult[];
  detail: {
    overdueOrders: OverdueOrderDetail[];
    routineUnfulfilledOrders: OverdueOrderDetail[];
    carrierIssues: CarrierIssueDetail[];
    inventoryRisks: InventoryRiskDetail[];
    topRefundSkus: TopRefundSkuDetail[];
    abnormalRefundOrders: AbnormalRefundOrderDetail[];
  };
};

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 36e5);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function displaySku(sku: string | null | undefined): string {
  return sku?.trim() || "UNKNOWN";
}

function emptyDiagnosis(shop: string, now: Date): OperationsDiagnosis {
  return {
    shop,
    generatedAt: now.toISOString(),
    hasData: false,
    totalOrdersAllTime: 0,
    summaryMetrics: {
      orderCount30d: 0,
      revenue30d: 0,
      aov30d: 0,
      cancelRate30d: 0,
      refundAmount30d: 0,
      refundRate30d: 0,
      refundRatePrev30d: 0,
      refundRateDelta: 0,
      fulfillmentRate30d: 0,
      averageFulfillmentHours: 0,
      salesAmount7d: 0,
      salesAmountPrev7d: 0,
      salesGrowthRate: null,
      orderCount7d: 0,
      orderCountPrev7d: 0,
      aov7d: 0,
      aovPrev7d: 0,
      pendingOrderCount: 0,
      overdueOrderCount: 0,
      carrierIssueCount: 0,
      riskSkuCount: 0,
      watchSkuCount: 0,
      estimatedInventoryLoss: 0,
      currency: "USD",
    },
    items: [],
    detail: {
      overdueOrders: [],
      routineUnfulfilledOrders: [],
      carrierIssues: [],
      inventoryRisks: [],
      topRefundSkus: [],
      abnormalRefundOrders: [],
    },
  };
}

// ──────────────────────────────────────────────
// 主入口
// ──────────────────────────────────────────────

export async function computeOperationsDiagnosis(
  shop: string,
  now: Date = new Date(),
): Promise<OperationsDiagnosis> {
  const since7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    orders,
    previousOrderCount,
    refunds,
    previousRefundOrderRows,
    refundLineItems,
    inventoryRows,
    orderLineItems,
    totalOrdersAllTime,
    currencyRow,
  ] = await Promise.all([
    prisma.shopOrder.findMany({
      where: { shop, createdAt: { gte: since30Days } },
      include: { fulfillments: true },
    }),
    prisma.shopOrder.count({
      where: { shop, createdAt: { gte: since60Days, lt: since30Days } },
    }),
    prisma.shopRefund.findMany({
      where: { shop, processedAt: { gte: since30Days } },
      include: { order: true, lineItems: true },
      orderBy: { processedAt: "desc" },
    }),
    prisma.shopRefund.findMany({
      where: { shop, processedAt: { gte: since60Days, lt: since30Days } },
      select: { shopifyOrderId: true },
    }),
    prisma.shopRefundLineItem.findMany({
      where: { shop, refund: { processedAt: { gte: since30Days } } },
    }),
    prisma.shopInventoryLevel.findMany({ where: { shop } }),
    prisma.shopOrderLineItem.findMany({
      where: {
        shop,
        order: { createdAt: { gte: since30Days }, status: { not: "cancelled" } },
      },
    }),
    prisma.shopOrder.count({ where: { shop } }),
    prisma.shopOrder.findFirst({
      where: { shop },
      orderBy: { createdAt: "desc" },
      select: { currency: true },
    }),
  ]);

  if (totalOrdersAllTime === 0) {
    return emptyDiagnosis(shop, now);
  }

  const currency = currencyRow?.currency ?? "USD";
  const nonCancelledOrders = orders.filter((o) => o.status !== "cancelled");
  const cancelledCount = orders.length - nonCancelledOrders.length;

  // ── 销售趋势（7d vs prev 7d，按订单创建时间）──
  const orders7d = nonCancelledOrders.filter((o) => o.createdAt >= since7Days);
  const ordersPrev7d = nonCancelledOrders.filter(
    (o) => o.createdAt >= since14Days && o.createdAt < since7Days,
  );
  const salesAmount7d = orders7d.reduce((s, o) => s + o.totalPrice, 0);
  const salesAmountPrev7d = ordersPrev7d.reduce((s, o) => s + o.totalPrice, 0);
  const salesGrowthRate =
    salesAmountPrev7d > 0
      ? ((salesAmount7d - salesAmountPrev7d) / salesAmountPrev7d) * 100
      : null;
  const aov7d = orders7d.length > 0 ? salesAmount7d / orders7d.length : 0;
  const aovPrev7d =
    ordersPrev7d.length > 0 ? salesAmountPrev7d / ordersPrev7d.length : 0;

  // ── 30d 总览 ──
  const revenue30d = nonCancelledOrders.reduce((s, o) => s + o.totalPrice, 0);
  const aov30d =
    nonCancelledOrders.length > 0 ? revenue30d / nonCancelledOrders.length : 0;
  const cancelRate30d =
    orders.length > 0 ? (cancelledCount / orders.length) * 100 : 0;

  // ── 退款 ──
  const refundOrderIds = new Set(refunds.map((r) => r.shopifyOrderId));
  const previousRefundOrderIds = new Set(
    previousRefundOrderRows.map((r) => r.shopifyOrderId),
  );
  const refundAmount30d = refunds.reduce((s, r) => s + r.refundAmount, 0);
  const refundRate30d =
    orders.length > 0 ? (refundOrderIds.size / orders.length) * 100 : 0;
  const refundRatePrev30d =
    previousOrderCount > 0
      ? (previousRefundOrderIds.size / previousOrderCount) * 100
      : 0;
  const refundRateDelta = refundRate30d - refundRatePrev30d;

  const topSkuMap = new Map<
    string,
    { title: string; quantity: number; amount: number; reasons: Map<string, number> }
  >();
  for (const line of refundLineItems) {
    const sku = displaySku(line.sku);
    const current = topSkuMap.get(sku) ?? {
      title: line.title ?? sku,
      quantity: 0,
      amount: 0,
      reasons: new Map<string, number>(),
    };
    current.quantity += line.quantity;
    current.amount += line.subtotal + line.totalTax;
    const reason = line.reason ?? "unspecified";
    current.reasons.set(reason, (current.reasons.get(reason) ?? 0) + 1);
    topSkuMap.set(sku, current);
  }
  const topRefundSkus: TopRefundSkuDetail[] = Array.from(topSkuMap.entries())
    .map(([sku, item]) => ({
      sku,
      title: item.title,
      quantity: item.quantity,
      amount: round(item.amount),
      reason:
        Array.from(item.reasons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "unspecified",
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const abnormalRefundThreshold = Math.max(
    aov30d * 1.5,
    refundAmount30d / Math.max(refunds.length, 1),
  );
  const abnormalRefundOrders: AbnormalRefundOrderDetail[] = refunds
    .filter(
      (r) => r.refundAmount >= abnormalRefundThreshold || r.lineItems.length >= 2,
    )
    .slice(0, 8)
    .map((r) => ({
      orderNumber: r.order?.orderNumber ? `#${r.order.orderNumber}` : r.shopifyOrderId,
      amount: round(r.refundAmount),
      rate:
        r.order?.totalPrice && r.order.totalPrice > 0
          ? round((r.refundAmount / r.order.totalPrice) * 100, 1)
          : null,
      reason: r.reason ?? r.refundNote ?? "unspecified",
      skus: r.lineItems.map((l) => displaySku(l.sku)).join(", ") || "UNKNOWN",
      processedAt: r.processedAt.toISOString(),
    }));

  // ── 履约 ──
  const fulfilledOrders = nonCancelledOrders.filter(
    (o) =>
      o.fulfillmentStatus === "fulfilled" ||
      o.fulfillments.some((f) => f.status === "success"),
  );
  const fulfillmentRate30d =
    nonCancelledOrders.length > 0
      ? (fulfilledOrders.length / nonCancelledOrders.length) * 100
      : 0;
  const fulfilledDurations = fulfilledOrders
    .map((o) => {
      const shippedAt = o.fulfillments
        .map((f) => f.shippedAt ?? f.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return shippedAt ? hoursBetween(o.createdAt, shippedAt) : null;
    })
    .filter((v): v is number => v !== null);
  const averageFulfillmentHours =
    fulfilledDurations.length > 0
      ? fulfilledDurations.reduce((s, v) => s + v, 0) / fulfilledDurations.length
      : 0;

  const pendingOrders = nonCancelledOrders.filter(
    (o) =>
      o.fulfillmentStatus !== "fulfilled" &&
      !o.fulfillments.some((f) => f.status === "success"),
  );
  const toOrderDetail = (o: (typeof pendingOrders)[number]): OverdueOrderDetail => ({
    orderNumber: `#${o.orderNumber}`,
    ageHours: round(hoursBetween(o.createdAt, now), 1),
    fulfillmentStatus: o.fulfillmentStatus ?? "unfulfilled",
    customer: o.customerEmail ?? o.email ?? "N/A",
  });
  const overdueOrders = pendingOrders
    .filter((o) => hoursBetween(o.createdAt, now) > SLA_HOURS)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toOrderDetail)
    .slice(0, 20);
  const overdueOrderCount = pendingOrders.filter(
    (o) => hoursBetween(o.createdAt, now) > SLA_HOURS,
  ).length;
  const routineUnfulfilledOrders = pendingOrders
    .filter((o) => hoursBetween(o.createdAt, now) <= SLA_HOURS)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toOrderDetail)
    .slice(0, 20);
  const routineUnfulfilledCount = pendingOrders.length - overdueOrderCount;

  // ── 物流轨迹 ──
  const carrierIssues: CarrierIssueDetail[] = [];
  let deliveryFailureCount = 0;
  let staleTrackingCount = 0;
  for (const order of orders) {
    for (const f of order.fulfillments) {
      const ageDays = hoursBetween(f.updatedAt, now) / 24;
      const isFailure =
        ["error", "failure"].includes(f.status) || f.shipmentStatus === "failure";
      const isStale = f.shipmentStatus === "in_transit" && ageDays > CARRIER_STALE_DAYS;
      if (!isFailure && !isStale) continue;
      if (isFailure) deliveryFailureCount += 1;
      else staleTrackingCount += 1;
      if (carrierIssues.length < 10) {
        carrierIssues.push({
          orderNumber: `#${order.orderNumber}`,
          carrier: f.trackingCompany ?? "N/A",
          trackingNumber: f.trackingNumber ?? "N/A",
          shipmentStatus: f.shipmentStatus ?? f.status,
          ageDays: round(ageDays, 1),
        });
      }
    }
  }
  const carrierIssueCount = deliveryFailureCount + staleTrackingCount;

  // ── 库存（30d 销量速度 × 可用库存）──
  const salesByKey = new Map<
    string,
    { sku: string; title: string; variantTitle: string | null; quantity: number; revenue: number }
  >();
  for (const line of orderLineItems) {
    const key = line.inventoryItemId ?? line.sku ?? line.variantId ?? line.lineItemId;
    const current = salesByKey.get(key) ?? {
      sku: displaySku(line.sku),
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: 0,
      revenue: 0,
    };
    if (!current.variantTitle && line.variantTitle) {
      current.variantTitle = line.variantTitle;
    }
    current.quantity += line.quantity;
    current.revenue += Math.max(0, line.price * line.quantity - line.totalDiscount);
    salesByKey.set(key, current);
  }
  const inventoryByKey = new Map<
    string,
    { available: number; sku: string; title: string; variantTitle: string | null }
  >();
  for (const inv of inventoryRows) {
    const keys = [inv.inventoryItemId, inv.sku, inv.variantId].filter(
      (v): v is string => Boolean(v),
    );
    for (const key of keys) {
      const current = inventoryByKey.get(key) ?? {
        available: 0,
        sku: displaySku(inv.sku),
        title: inv.productTitle ?? displaySku(inv.sku),
        variantTitle: inv.variantTitle,
      };
      current.available += inv.available;
      inventoryByKey.set(key, current);
    }
  }

  const inventoryRisks: InventoryRiskDetail[] = Array.from(salesByKey.entries())
    .map(([key, sales]) => {
      const inventory = inventoryByKey.get(key) ?? inventoryByKey.get(sales.sku);
      const available = inventory?.available ?? 0;
      const velocity = sales.quantity / 30;
      const sellableDays = velocity > 0 ? available / velocity : Number.POSITIVE_INFINITY;
      const unitRevenue = sales.quantity > 0 ? sales.revenue / sales.quantity : 0;
      const estimatedLoss = Math.max(0, velocity * 7 - available) * unitRevenue;
      const risk: DiagnosisStatus =
        available <= 0 || sellableDays < SELLABLE_DAYS_RISK
          ? "risk"
          : sellableDays < SELLABLE_DAYS_WATCH
            ? "watch"
            : "healthy";
      return {
        sku: inventory?.sku ?? sales.sku,
        title: inventory?.title ?? sales.title,
        variantTitle: sales.variantTitle ?? "—",
        available,
        dailySalesVelocity: round(velocity, 2),
        sellableDays: Number.isFinite(sellableDays) ? round(sellableDays, 1) : null,
        estimatedLoss: round(estimatedLoss),
        risk,
      };
    })
    .filter((item): item is InventoryRiskDetail => item.risk !== "healthy")
    .sort((a, b) => {
      if (a.risk !== b.risk) return a.risk === "risk" ? -1 : 1;
      return b.estimatedLoss - a.estimatedLoss;
    })
    .slice(0, 20);
  const riskSkuCount = inventoryRisks.filter((i) => i.risk === "risk").length;
  const watchSkuCount = inventoryRisks.filter((i) => i.risk === "watch").length;
  const estimatedInventoryLoss = round(
    inventoryRisks.reduce((s, i) => s + i.estimatedLoss, 0),
  );

  // ──────────────────────────────────────────
  // 组装诊断项
  // ──────────────────────────────────────────

  const items: DiagnosisItemResult[] = [];

  // 1. 销售趋势（文档 §7.1）
  {
    const orderCountDropRate =
      ordersPrev7d.length > 0
        ? ((orders7d.length - ordersPrev7d.length) / ordersPrev7d.length) * 100
        : null;
    const aovDropRate = aovPrev7d > 0 ? ((aov7d - aovPrev7d) / aovPrev7d) * 100 : null;
    let status: DiagnosisStatus = "healthy";
    const reasoning: string[] = [];
    if (salesGrowthRate !== null && salesGrowthRate < SALES_DECLINE_WATCH_PERCENT) {
      status = salesGrowthRate < SALES_DECLINE_RISK_PERCENT ? "risk" : "watch";
      if (
        orderCountDropRate !== null &&
        aovDropRate !== null &&
        orderCountDropRate < aovDropRate
      ) {
        reasoning.push(
          "订单量下滑幅度大于客单价下滑幅度，销售下滑主要由订单量减少驱动，优先排查流量与转化",
        );
      } else if (aovDropRate !== null && aovDropRate < 0) {
        reasoning.push(
          "客单价下滑明显，销售下滑主要由客单价下降驱动，优先排查价格策略与商品组合",
        );
      } else {
        reasoning.push("近 7 天销售额低于上一周期，需结合渠道数据进一步归因");
      }
    } else if (salesGrowthRate !== null && salesGrowthRate >= 5) {
      reasoning.push("近 7 天销售额环比增长 ≥ 5%，销售趋势健康");
    } else if (salesGrowthRate === null) {
      reasoning.push("上一周期无销售额，无法计算环比，仅观察当前周期绝对值");
    } else {
      reasoning.push("近 7 天销售额环比基本持平");
    }
    items.push({
      key: "sales_trend",
      name: "销售趋势",
      status,
      metrics: {
        salesAmount7d: round(salesAmount7d),
        salesAmountPrev7d: round(salesAmountPrev7d),
        salesGrowthRate: salesGrowthRate === null ? null : round(salesGrowthRate, 1),
        orderCount7d: orders7d.length,
        orderCountPrev7d: ordersPrev7d.length,
        aov7d: round(aov7d),
        aovPrev7d: round(aovPrev7d),
        currency,
      },
      evidence: [
        `近 7 天销售额 ${round(salesAmount7d)} ${currency}，上一周期 ${round(salesAmountPrev7d)} ${currency}` +
          (salesGrowthRate === null ? "" : `，环比 ${round(salesGrowthRate, 1)}%`),
        `近 7 天订单 ${orders7d.length} 单（上期 ${ordersPrev7d.length} 单），客单价 ${round(aov7d)}（上期 ${round(aovPrev7d)}）`,
      ],
      reasoning,
      formulas: [
        "sales_growth_rate = (sales_amount_7d - sales_amount_prev_7d) / sales_amount_prev_7d * 100",
        "aov_7d = sales_amount_7d / order_count_7d",
      ],
    });
  }

  // 2. 履约健康（文档 §7.4）
  {
    const overdueShare =
      nonCancelledOrders.length > 0
        ? (overdueOrderCount / nonCancelledOrders.length) * 100
        : 0;
    let status: DiagnosisStatus = "healthy";
    const reasoning: string[] = [];
    if (overdueOrderCount > 0) {
      status =
        overdueShare > 10 || fulfillmentRate30d < 40 ? "risk" : "watch";
      reasoning.push(
        `存在 ${overdueOrderCount} 单超过 ${SLA_HOURS} 小时未发货，按规则至少进入「关注」`,
      );
      if (status === "risk") {
        reasoning.push("超时单占比偏高或履约率过低，升级为「风险」");
      }
    } else if (fulfillmentRate30d < 70 && nonCancelledOrders.length > 0) {
      status = "watch";
      reasoning.push("无超时单，但 30 天履约率低于 70%，需要关注发货节奏");
    } else {
      reasoning.push("无超时未发货订单，履约健康");
    }
    items.push({
      key: "fulfillment_health",
      name: "履约健康",
      status,
      metrics: {
        pendingOrderCount: pendingOrders.length,
        overdueOrderCount,
        routineUnfulfilledCount,
        fulfillmentRate30d: round(fulfillmentRate30d, 1),
        averageFulfillmentHours: round(averageFulfillmentHours, 1),
        slaHours: SLA_HOURS,
      },
      evidence: [
        `待发货 ${pendingOrders.length} 单，其中超时（>${SLA_HOURS}h）${overdueOrderCount} 单`,
        `30 天履约率 ${round(fulfillmentRate30d, 1)}%，平均发货时长 ${round(averageFulfillmentHours, 1)} 小时`,
      ],
      reasoning,
      formulas: [
        "fulfillment_rate = fulfilled_orders / non_cancelled_orders * 100",
        `overdue_orders = count(orders where now - created_at > ${SLA_HOURS}h and not fulfilled)`,
      ],
    });
  }

  // 3. 物流轨迹异常（文档 §7.5）
  {
    let status: DiagnosisStatus = "healthy";
    const reasoning: string[] = [];
    if (deliveryFailureCount > 0) {
      status = "risk";
      reasoning.push(
        `存在 ${deliveryFailureCount} 单投递失败/异常，客户体验风险显著上升`,
      );
    } else if (staleTrackingCount > 0) {
      status = staleTrackingCount >= 5 ? "risk" : "watch";
      reasoning.push(
        `存在 ${staleTrackingCount} 单在途超过 ${CARRIER_STALE_DAYS} 天无新轨迹，承运商时效或轨迹同步存在风险`,
      );
    } else {
      reasoning.push("未发现轨迹停滞或投递失败");
    }
    items.push({
      key: "logistics_anomaly",
      name: "物流轨迹异常",
      status,
      metrics: {
        staleTrackingCount,
        deliveryFailureCount,
        carrierStaleDays: CARRIER_STALE_DAYS,
      },
      evidence: [
        `在途停滞（>${CARRIER_STALE_DAYS} 天）${staleTrackingCount} 单，投递失败/异常 ${deliveryFailureCount} 单`,
      ],
      reasoning,
      formulas: [
        `stale_tracking_orders = count(shipment_status = "in_transit" and days_since_last_event > ${CARRIER_STALE_DAYS})`,
        'delivery_failure_orders = count(shipment_status in ["failure"] or fulfillment_status in ["error","failure"])',
      ],
    });
  }

  // 4. 退款与售后（文档 §7.6）
  {
    let status: DiagnosisStatus = "healthy";
    const reasoning: string[] = [];
    if (
      refundRate30d > REFUND_RATE_RISK_PERCENT ||
      (refundRate30d > REFUND_RATE_WATCH_PERCENT && refundRateDelta > 0)
    ) {
      status = "risk";
      reasoning.push(
        `退款率 ${round(refundRate30d, 1)}% 超过告警线且环比上升，退款风险上升`,
      );
    } else if (
      refundRate30d > REFUND_RATE_WATCH_PERCENT ||
      refundRateDelta > REFUND_SPIKE_PERCENT_POINTS
    ) {
      status = "watch";
      reasoning.push("退款率偏高或环比明显上升，需要复盘退款原因");
    } else {
      reasoning.push("退款率处于正常区间");
    }
    if (topRefundSkus.length > 0 && status !== "healthy") {
      reasoning.push(
        `退款集中在少数 SKU（Top1：${topRefundSkus[0].sku}），优先判断为商品问题而非全局运营问题`,
      );
    }
    items.push({
      key: "refund_health",
      name: "退款与售后",
      status,
      metrics: {
        refundRate30d: round(refundRate30d, 1),
        refundRatePrev30d: round(refundRatePrev30d, 1),
        refundRateDelta: round(refundRateDelta, 1),
        refundAmount30d: round(refundAmount30d),
        refundOrderCount: refundOrderIds.size,
        topRefundSkuCount: topRefundSkus.length,
        abnormalRefundOrderCount: abnormalRefundOrders.length,
      },
      evidence: [
        `30 天退款率 ${round(refundRate30d, 1)}%（上期 ${round(refundRatePrev30d, 1)}%，环比 ${refundRateDelta >= 0 ? "+" : ""}${round(refundRateDelta, 1)}pp）`,
        `退款金额 ${round(refundAmount30d)} ${currency}，涉及 ${refundOrderIds.size} 单`,
      ],
      reasoning,
      formulas: [
        "refund_rate = refunded_order_count / order_count * 100",
        "refund_rate_delta = refund_rate_current_period - refund_rate_previous_period",
      ],
    });
  }

  // 5. 库存健康（文档 §7.8）
  {
    let status: DiagnosisStatus = "healthy";
    const reasoning: string[] = [];
    if (riskSkuCount > 0) {
      status = "risk";
      reasoning.push(
        `${riskSkuCount} 个高动销 SKU 缺货或可售天数不足 ${SELLABLE_DAYS_RISK} 天，预计未来 7 天损失 ${estimatedInventoryLoss} ${currency}`,
      );
    } else if (watchSkuCount > 0) {
      status = "watch";
      reasoning.push(
        `${watchSkuCount} 个 SKU 可售天数低于 ${SELLABLE_DAYS_WATCH} 天，需关注补货节奏`,
      );
    } else {
      reasoning.push("有销量 SKU 的库存可支撑当前销售速度");
    }
    items.push({
      key: "inventory_health",
      name: "库存健康",
      status,
      metrics: {
        riskSkuCount,
        watchSkuCount,
        estimatedInventoryLoss,
        sellableDaysRiskThreshold: SELLABLE_DAYS_RISK,
      },
      evidence: [
        `高风险 SKU ${riskSkuCount} 个，关注级 SKU ${watchSkuCount} 个，预估缺货损失 ${estimatedInventoryLoss} ${currency}`,
      ],
      reasoning,
      formulas: [
        "sellable_days = available_inventory / (sku_sales_quantity_30d / 30)",
        "estimated_lost_revenue = max(0, daily_velocity * 7 - available) * unit_revenue",
      ],
    });
  }

  return {
    shop,
    generatedAt: now.toISOString(),
    hasData: true,
    totalOrdersAllTime,
    summaryMetrics: {
      orderCount30d: orders.length,
      revenue30d: round(revenue30d),
      aov30d: round(aov30d),
      cancelRate30d: round(cancelRate30d, 1),
      refundAmount30d: round(refundAmount30d),
      refundRate30d: round(refundRate30d, 1),
      refundRatePrev30d: round(refundRatePrev30d, 1),
      refundRateDelta: round(refundRateDelta, 1),
      fulfillmentRate30d: round(fulfillmentRate30d, 1),
      averageFulfillmentHours: round(averageFulfillmentHours, 1),
      salesAmount7d: round(salesAmount7d),
      salesAmountPrev7d: round(salesAmountPrev7d),
      salesGrowthRate: salesGrowthRate === null ? null : round(salesGrowthRate, 1),
      orderCount7d: orders7d.length,
      orderCountPrev7d: ordersPrev7d.length,
      aov7d: round(aov7d),
      aovPrev7d: round(aovPrev7d),
      pendingOrderCount: pendingOrders.length,
      overdueOrderCount,
      carrierIssueCount,
      riskSkuCount,
      watchSkuCount,
      estimatedInventoryLoss,
      currency,
    },
    items,
    detail: {
      overdueOrders,
      routineUnfulfilledOrders,
      carrierIssues,
      inventoryRisks,
      topRefundSkus,
      abnormalRefundOrders,
    },
  };
}
