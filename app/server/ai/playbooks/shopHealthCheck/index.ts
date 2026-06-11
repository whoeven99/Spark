import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getShopChatModel } from "../../core/shopChatGraph.server";
import type {
  PlaybookDefinition,
  PlaybookRunParams,
  PlaybookRunResult,
  PlaybookStepResult,
} from "../../core/playbookRegistry.server";
import { ensureDailySnapshot } from "../../../operations/dailyInspection.server";

// ──────────────────────────────────────────────
// Shopify GraphQL 查询
// ──────────────────────────────────────────────

const SHOP_INFO_QUERY = `
  query ShopHealthCheck {
    shop {
      name
      currencyCode
      primaryDomain { url }
    }
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      nodes {
        totalPriceSet { shopMoney { amount currencyCode } }
        refunds { totalRefundedSet { shopMoney { amount } } }
        cancelledAt
        createdAt
      }
    }
    productsCount { count }
    collections(first: 1) { nodes { productsCount { count } } }
  }
`;

const INVENTORY_QUERY = `
  query InventoryHealth {
    productVariants(first: 100) {
      nodes {
        inventoryQuantity
        product { title status }
      }
    }
  }
`;

// ──────────────────────────────────────────────
// 数据处理工具函数
// ──────────────────────────────────────────────

interface OrderNode {
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  refunds: { totalRefundedSet: { shopMoney: { amount: string } } }[];
  cancelledAt: string | null;
  createdAt: string;
}

function calcOrderMetrics(orders: OrderNode[]) {
  const validOrders = orders.filter((o) => !o.cancelledAt);
  const gmv = validOrders.reduce(
    (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
    0
  );
  const refunded = validOrders.reduce((sum, o) => {
    return (
      sum +
      o.refunds.reduce(
        (r, ref) => r + parseFloat(ref.totalRefundedSet.shopMoney.amount),
        0
      )
    );
  }, 0);
  const refundRate = gmv > 0 ? ((refunded / gmv) * 100).toFixed(1) : "0";
  return {
    orderCount: validOrders.length,
    gmv: gmv.toFixed(2),
    currency: orders[0]?.totalPriceSet.shopMoney.currencyCode ?? "USD",
    refundedAmount: refunded.toFixed(2),
    refundRate,
  };
}

interface VariantNode {
  inventoryQuantity: number;
  product: { title: string; status: string };
}

function calcInventoryHealth(variants: VariantNode[]) {
  const active = variants.filter((v) => v.product.status === "ACTIVE");
  const outOfStock = active.filter((v) => v.inventoryQuantity <= 0);
  const lowStock = active.filter(
    (v) => v.inventoryQuantity > 0 && v.inventoryQuantity <= 5
  );
  return {
    activeVariants: active.length,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    outOfStockRate:
      active.length > 0
        ? ((outOfStock.length / active.length) * 100).toFixed(1)
        : "0",
  };
}

// ──────────────────────────────────────────────
// Playbook run 函数
// ──────────────────────────────────────────────

async function run({
  goal,
  constraints,
  context,
  onStep,
}: PlaybookRunParams): Promise<PlaybookRunResult> {
  const steps: PlaybookStepResult[] = [];
  let fallbackNote = "";

  // ── 优先路径：读每日诊断快照（全量同步数据，与每日待办页同口径）──
  if (context.shop) {
    try {
      onStep?.("数据拉取", "running");
      const daily = await ensureDailySnapshot(context.shop);
      if (daily.hasData) {
        onStep?.("数据拉取", "completed");
        steps.push({
          step: "数据拉取",
          status: "completed",
          output: `已读取 ${daily.snapshotDate} 经营诊断快照（基于全量同步数据）`,
        });

        onStep?.("异常检测", "running");
        const anomalies = daily.items
          .filter((item) => item.status !== "healthy")
          .map(
            (item) =>
              `${item.name}（${item.status === "risk" ? "风险" : "关注"}）：${[...item.evidence, ...item.reasoning].join("；")}`,
          );
        onStep?.("异常检测", "completed");
        steps.push({
          step: "异常检测",
          status: "completed",
          output:
            anomalies.length > 0
              ? `发现 ${anomalies.length} 项异常：${anomalies.join("；")}`
              : "未发现明显异常",
        });

        const openTasks = daily.tasks.filter((task) =>
          ["open", "in_progress"].includes(task.status),
        );
        const dataContext = JSON.stringify(
          {
            snapshotDate: daily.snapshotDate,
            metrics: daily.metrics,
            diagnosis: daily.items.map((item) => ({
              name: item.name,
              status: item.status,
              evidence: item.evidence,
              reasoning: item.reasoning,
            })),
            openTasks: openTasks.map((task) => ({
              title: task.title,
              quadrant: task.quadrant,
              priority: task.priority,
              triggerReason: task.triggerReason,
            })),
            anomalies,
            userGoal: goal,
            userConstraints: constraints ?? "无",
          },
          null,
          2,
        );

        let summary = "";
        try {
          onStep?.("建议生成", "running");
          const model = getShopChatModel();
          const response = await model.invoke([
            new SystemMessage(
              "你是一个电商经营分析助手。根据以下店铺每日诊断快照数据，生成简洁的经营健康报告：包含核心 KPI 概览、异常点说明、待办任务优先级提示，以及 2-3 条优先建议。使用简体中文，结构清晰，不使用 Markdown 表格。",
            ),
            new HumanMessage(`店铺诊断数据：\n${dataContext}`),
          ]);
          summary =
            typeof response.content === "string"
              ? response.content
              : JSON.stringify(response.content);
          onStep?.("建议生成", "completed");
          steps.push({ step: "建议生成", status: "completed", output: "健康报告已生成" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          onStep?.("建议生成", "error");
          steps.push({ step: "建议生成", status: "error", output: `LLM 合成失败：${msg}` });
          summary =
            `【经营体检结果】（${daily.snapshotDate}）\n` +
            `近 7 天销售额 ${daily.metrics.salesAmount7d} ${daily.metrics.currency}，超时未发货 ${daily.metrics.overdueOrderCount} 单，30 天退款率 ${daily.metrics.refundRate30d}%，高风险 SKU ${daily.metrics.riskSkuCount} 个\n` +
            (anomalies.length > 0 ? `异常：${anomalies.join("；")}` : "未发现明显异常") +
            (openTasks.length > 0 ? `\n待办：${openTasks.map((t) => `[${t.priority}] ${t.title}`).join("；")}` : "");
        }

        return {
          ok: true,
          summary,
          steps,
          data: {
            snapshotDate: daily.snapshotDate,
            metrics: daily.metrics,
            anomalies,
            openTaskCount: openTasks.length,
          },
        };
      }
      // 没有同步数据：回退到实时 GraphQL 粗诊断
      fallbackNote = "暂无已同步订单数据，回退到实时 GraphQL 拉取（近 50 单采样）";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fallbackNote = `诊断快照读取失败（${msg}），回退到实时 GraphQL 拉取`;
    }
  }

  // ── 回退路径：实时 GraphQL 采样诊断 ──
  // ── Step 1: 数据拉取 ──
  let shopData: Record<string, unknown> = {};
  let inventoryData: Record<string, unknown> = {};
  try {
    onStep?.("数据拉取", "running");
    const [shopRes, invRes] = await Promise.all([
      context.admin.graphql(SHOP_INFO_QUERY),
      context.admin.graphql(INVENTORY_QUERY),
    ]);
    shopData = (await shopRes.json()) as Record<string, unknown>;
    inventoryData = (await invRes.json()) as Record<string, unknown>;

    onStep?.("数据拉取", "completed");
    steps.push({
      step: "数据拉取",
      status: "completed",
      output:
        "店铺、订单、库存数据已获取" + (fallbackNote ? `（${fallbackNote}）` : ""),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onStep?.("数据拉取", "error");
    steps.push({ step: "数据拉取", status: "error", output: `GraphQL 查询失败：${msg}` });
    return { ok: false, summary: `数据拉取失败：${msg}`, steps };
  }

  // ── Step 2: 异常检测 ──
  onStep?.("异常检测", "running");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopNode = (shopData as any)?.data?.shop ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderNodes: OrderNode[] = (shopData as any)?.data?.orders?.nodes ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantNodes: VariantNode[] = (inventoryData as any)?.data?.productVariants?.nodes ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productsCount = (shopData as any)?.data?.productsCount?.count ?? 0;

  const orderMetrics = calcOrderMetrics(orderNodes);
  const invHealth = calcInventoryHealth(variantNodes);

  const anomalies: string[] = [];
  if (parseFloat(orderMetrics.refundRate) > 10)
    anomalies.push(`退款率偏高：${orderMetrics.refundRate}%（建议排查退款原因）`);
  if (parseFloat(invHealth.outOfStockRate) > 20)
    anomalies.push(`缺货率偏高：${invHealth.outOfStockRate}%（${invHealth.outOfStockCount} 个 SKU 缺货）`);
  if (invHealth.lowStockCount > 0)
    anomalies.push(`${invHealth.lowStockCount} 个 SKU 库存 ≤ 5（需关注补货）`);

  onStep?.("异常检测", "completed");
  steps.push({
    step: "异常检测",
    status: "completed",
    output: anomalies.length > 0 ? `发现 ${anomalies.length} 项异常：${anomalies.join("；")}` : "未发现明显异常",
  });

  // ── Step 3: 建议生成（LLM 合成）──
  const dataContext = JSON.stringify({
    shop: { name: shopNode.name, currency: shopNode.currencyCode, domain: shopNode.primaryDomain?.url },
    recentOrders: orderMetrics,
    inventory: invHealth,
    productsCount,
    anomalies,
    userGoal: goal,
    userConstraints: constraints ?? "无",
  }, null, 2);

  let summary = "";
  try {
    onStep?.("建议生成", "running");
    const model = getShopChatModel();
    const response = await model.invoke([
      new SystemMessage(
        "你是一个电商经营分析助手。根据以下店铺数据，生成简洁的经营健康报告：包含核心 KPI 概览、异常点说明、以及 2-3 条优先建议。使用简体中文，结构清晰，不使用 Markdown 表格。"
      ),
      new HumanMessage(`店铺数据：\n${dataContext}`),
    ]);
    summary = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    onStep?.("建议生成", "completed");
    steps.push({ step: "建议生成", status: "completed", output: "健康报告已生成" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onStep?.("建议生成", "error");
    steps.push({ step: "建议生成", status: "error", output: `LLM 合成失败：${msg}` });
    // 降级：仅返回结构化数据
    summary = `【经营体检结果】\n近期订单：${orderMetrics.orderCount} 单，GMV ${orderMetrics.gmv} ${orderMetrics.currency}，退款率 ${orderMetrics.refundRate}%\n库存：${invHealth.activeVariants} 个活跃 SKU，${invHealth.outOfStockCount} 个缺货\n${anomalies.length > 0 ? "异常：" + anomalies.join("；") : "未发现明显异常"}`;
  }

  return {
    ok: true,
    summary,
    steps,
    data: { orderMetrics, invHealth, anomalies, productsCount },
  };
}

// ──────────────────────────────────────────────
// Playbook 定义
// ──────────────────────────────────────────────

export const shopHealthCheckPlaybook: PlaybookDefinition = {
  name: "shopHealthCheck",
  displayName: "经营体检",
  description:
    "基于每日经营诊断快照（销售/履约/物流/退款/库存）检测异常，生成 KPI 健康报告与优先建议；无同步数据时回退实时拉取",
  category: "operations",
  triggerDescription:
    "当用户询问店铺整体经营状况、KPI 概览、健康体检、异常分析、数据诊断等时触发。",
  steps: [
    { id: "数据拉取", label: "数据拉取", kind: "data", stage: "dataAlign", runningLabel: "正在拉取店铺/订单/库存数据" },
    { id: "异常检测", label: "异常检测", kind: "qc", stage: "diagnose", runningLabel: "正在检测异常指标" },
    { id: "建议生成", label: "建议生成", kind: "llm", stage: "propose", runningLabel: "正在调用大模型生成健康报告" },
  ],
  run,
};
