import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getShopChatModel } from "../../core/shopChatGraph.server";
import type {
  PlaybookDefinition,
  PlaybookRunParams,
  PlaybookRunResult,
  PlaybookStepResult,
} from "../../core/playbookRegistry.server";

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
    steps.push({ step: "数据拉取", status: "completed", output: "店铺、订单、库存数据已获取" });
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
  description: "拉取店铺核心数据，自动检测异常，生成 KPI 健康报告与优先建议",
  category: "operations",
  triggerDescription:
    "当用户询问店铺整体经营状况、KPI 概览、健康体检、异常分析、数据诊断等时触发。",
  steps: ["数据拉取", "异常检测", "建议生成"],
  run,
};
