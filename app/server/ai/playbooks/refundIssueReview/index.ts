import type {
  PlaybookDefinition,
  PlaybookRunParams,
  PlaybookRunResult,
  PlaybookStepResult,
} from "../../core/playbookRegistry.server";
import { ensureDailySnapshot } from "../../../operations/dailyInspection.server";
import type {
  AbnormalRefundOrderDetail,
  TopRefundSkuDetail,
} from "../../../operations/diagnosis.server";

const TOP_SKU_LIMIT = 5;
const TOP_ORDER_LIMIT = 6;

function money(amount: number, currency: string): string {
  return `${Math.round(amount)} ${currency}`;
}

function sortRefundSkus(items: TopRefundSkuDetail[]): TopRefundSkuDetail[] {
  return [...items].sort((a, b) => b.amount - a.amount);
}

function sortRefundOrders(items: AbnormalRefundOrderDetail[]): AbnormalRefundOrderDetail[] {
  return [...items].sort((a, b) => b.amount - a.amount);
}

function buildSummary(params: {
  currency: string;
  refundRate30d: number;
  refundRateDelta: number;
  refundAmount30d: number;
  topSkus: TopRefundSkuDetail[];
  abnormalOrders: AbnormalRefundOrderDetail[];
  constraints?: string;
}): string {
  const {
    currency,
    refundRate30d,
    refundRateDelta,
    refundAmount30d,
    topSkus,
    abnormalOrders,
    constraints,
  } = params;
  const delta = `${refundRateDelta >= 0 ? "+" : ""}${refundRateDelta}pp`;
  const lines = [
    "## 退款异常治理方案",
    "",
    `风险概览：30 天退款率 ${refundRate30d}%（环比 ${delta}），退款金额 ${money(refundAmount30d, currency)}。`,
  ];

  if (constraints?.trim()) {
    lines.push(`约束条件：${constraints.trim()}`);
  }

  if (topSkus.length > 0) {
    lines.push("", "优先排查 SKU：");
    for (const item of topSkus) {
      lines.push(
        `- ${item.sku}｜${item.title}｜退款数量 ${item.quantity}｜退款金额 ${money(item.amount, currency)}｜主要原因 ${item.reason}`,
      );
    }
  }

  if (abnormalOrders.length > 0) {
    lines.push("", "高额/异常订单：");
    for (const order of abnormalOrders) {
      const rate = order.rate === null ? "无订单金额基线" : `${order.rate}%`;
      lines.push(
        `- ${order.orderNumber}｜退款金额 ${money(order.amount, currency)}｜占订单 ${rate}｜原因 ${order.reason}｜SKU ${order.skus}`,
      );
    }
  }

  if (topSkus.length === 0 && abnormalOrders.length === 0) {
    lines.push("", "当前没有足够的 SKU 或订单级退款明细，建议先补齐退款行项目同步。");
  }

  lines.push(
    "",
    "建议动作：",
    "- 先处理退款金额最高的 SKU，复核商品描述、尺码/规格、质量反馈和物流承诺是否一致。",
    "- 将异常订单分成商品问题、物流问题、售后响应问题三类，避免把全局退款率误判为单一原因。",
    "- 对高频退款 SKU 暂停放大投放，先修正文案、图片、FAQ 或质检流程。",
    "- 48 小时后复盘 refundRate30d、refundRateDelta 和 Top SKU 退款金额是否下降。",
  );

  return lines.join("\n");
}

async function run({
  goal,
  constraints,
  context,
  onStep,
}: PlaybookRunParams): Promise<PlaybookRunResult> {
  const steps: PlaybookStepResult[] = [];
  const shop = context.shop?.trim();

  if (!shop) {
    return {
      ok: false,
      summary: "无法识别当前店铺，暂时不能生成退款治理方案。",
      steps,
    };
  }

  try {
    onStep?.("读取诊断快照", "running");
    const daily = await ensureDailySnapshot(shop);
    onStep?.("读取诊断快照", "completed");
    steps.push({
      step: "读取诊断快照",
      status: "completed",
      output: daily.hasData
        ? `已读取 ${daily.snapshotDate} 经营诊断快照`
        : "暂无可用经营诊断快照",
    });

    if (!daily.hasData) {
      return {
        ok: true,
        summary: "店铺暂无已同步的订单/退款数据，暂时不能生成可靠的退款治理方案。建议先完成历史订单和退款同步。",
        steps,
      };
    }

    onStep?.("退款对象归因", "running");
    const topSkus = sortRefundSkus(daily.detail.topRefundSkus).slice(0, TOP_SKU_LIMIT);
    const abnormalOrders = sortRefundOrders(daily.detail.abnormalRefundOrders).slice(0, TOP_ORDER_LIMIT);
    onStep?.("退款对象归因", "completed");
    steps.push({
      step: "退款对象归因",
      status: "completed",
      output: `已整理 ${topSkus.length} 个高退款 SKU 和 ${abnormalOrders.length} 个异常退款订单`,
    });

    onStep?.("治理动作生成", "running");
    const summary = buildSummary({
      currency: daily.metrics.currency,
      refundRate30d: daily.metrics.refundRate30d,
      refundRateDelta: daily.metrics.refundRateDelta,
      refundAmount30d: daily.metrics.refundAmount30d,
      topSkus,
      abnormalOrders,
      constraints,
    });
    onStep?.("治理动作生成", "completed");
    steps.push({
      step: "治理动作生成",
      status: "completed",
      output: "退款治理方案已生成",
    });
    const reviewDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    return {
      ok: true,
      summary,
      steps,
      data: {
        snapshotDate: daily.snapshotDate,
        refundRate30d: daily.metrics.refundRate30d,
        refundRateDelta: daily.metrics.refundRateDelta,
        refundAmount30d: daily.metrics.refundAmount30d,
        goal,
        constraints,
        topSkus,
        abnormalOrders,
      },
      structuredResult: {
        diagnosis: [
          {
            title: "退款异常需要专项治理",
            detail: `30 天退款率 ${daily.metrics.refundRate30d}%（环比 ${daily.metrics.refundRateDelta >= 0 ? "+" : ""}${daily.metrics.refundRateDelta}pp）。`,
            severity:
              daily.metrics.refundRateDelta > 0 || daily.metrics.refundRate30d > 5
                ? "risk"
                : "watch",
            metrics: {
              refundRate30d: daily.metrics.refundRate30d,
              refundRateDelta: daily.metrics.refundRateDelta,
              refundAmount30d: daily.metrics.refundAmount30d,
            },
          },
        ],
        evidence: [
          { label: "30 天退款率", value: `${daily.metrics.refundRate30d}%`, source: "daily_diagnosis" },
          {
            label: "退款率环比",
            value: `${daily.metrics.refundRateDelta >= 0 ? "+" : ""}${daily.metrics.refundRateDelta}pp`,
            source: "daily_diagnosis",
          },
          {
            label: "30 天退款金额",
            value: money(daily.metrics.refundAmount30d, daily.metrics.currency),
            source: "daily_diagnosis",
          },
          ...topSkus.slice(0, 5).map((sku) => ({
            label: sku.sku,
            value: money(sku.amount, daily.metrics.currency),
            detail: `${sku.title}｜退款数量 ${sku.quantity}｜主要原因 ${sku.reason}`,
            source: "top_refund_skus",
          })),
        ],
        actions: [
          {
            title: "优先复核退款金额最高的 SKU",
            detail: "检查商品描述、尺码/规格、质量反馈和物流承诺是否一致。",
            priority: "P0",
            status: "proposed",
          },
          {
            title: "按原因拆分异常订单",
            detail: "分成商品问题、物流问题、售后响应问题三类，避免误判为单一原因。",
            priority: "P1",
            status: "proposed",
          },
          {
            title: "暂停高频退款 SKU 放大投放",
            detail: "先修正文案、图片、FAQ 或质检流程，再恢复投放扩大。",
            priority: "P1",
            status: "proposed",
          },
        ],
        reviewMetrics: [
          {
            key: "refundRate30d",
            label: "30 天退款率",
            current: daily.metrics.refundRate30d,
            direction: "decrease",
          },
          {
            key: "refundRateDelta",
            label: "退款率环比",
            current: daily.metrics.refundRateDelta,
            target: 0,
            direction: "decrease",
          },
          {
            key: "topRefundSkuAmount",
            label: "Top SKU 退款金额",
            current: topSkus[0]?.amount ?? 0,
            direction: "decrease",
          },
        ],
        followUps: [
          {
            title: "48 小时后复盘退款治理效果",
            detail: "重点看 refundRate30d、refundRateDelta 和 Top SKU 退款金额是否下降。",
            dueAt: reviewDueAt,
          },
        ],
      },
      caseDraft: {
        title: "退款异常治理方案",
        severity:
          daily.metrics.refundRateDelta > 0 || daily.metrics.refundRate30d > 5
            ? "risk"
            : "watch",
        reviewDueAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onStep?.("读取诊断快照", "error");
    steps.push({
      step: "读取诊断快照",
      status: "error",
      output: `退款诊断读取失败：${message}`,
    });
    return {
      ok: false,
      summary: `退款治理方案生成失败：${message}`,
      steps,
    };
  }
}

export const refundIssueReviewPlaybook: PlaybookDefinition = {
  name: "refundIssueReview",
  displayName: "退款治理",
  description:
    "基于退款率、Top 退款 SKU 和异常退款订单，生成商品、物流、售后三个方向的退款治理排查清单。",
  category: "afterSales",
  triggerDescription:
    "当用户询问退款率上升、售后异常、高退款 SKU、异常退款订单、退款原因复盘或如何降低退款时触发。",
  steps: [
    { id: "读取诊断快照", label: "读取诊断快照", kind: "data", stage: "dataAlign", runningLabel: "正在读取每日经营诊断快照" },
    { id: "退款对象归因", label: "退款对象归因", kind: "compute", stage: "diagnose", runningLabel: "正在整理高退款 SKU 和异常退款订单" },
    { id: "治理动作生成", label: "治理动作生成", kind: "compute", stage: "propose", runningLabel: "正在生成退款治理动作" },
  ],
  presentation: {
    icon: "REF",
    entryTitle: "退款治理",
    entrySubtitle: "定位高退款 SKU 和异常订单，拆出治理动作",
    evidenceKeys: ["refundRate30d", "refundRateDelta", "topRefundSkus"],
    defaultPrompt: "运行 Playbook「退款治理」，复盘退款率上升原因并给出治理方案。",
    ctaLabel: "复盘退款原因",
    runTitle: "退款治理 Playbook",
    reviewMetrics: ["refundRate30d", "refundRateDelta", "topRefundSkus"],
  },
  systemPromptExtension:
    "当触发退款治理 Playbook 时，必须基于诊断快照中的 refundRate30d、refundRateDelta、refundAmount30d、topRefundSkus 和 abnormalRefundOrders 输出；不要凭空编造退款原因或订单。",
  run,
};
