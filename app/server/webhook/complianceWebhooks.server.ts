/**
 * Shopify App Store 强制合规 webhook。
 * - customers/data_request：记录请求（30 天内可人工导出；当前无独立出站通道）
 * - customers/redact：删除该客户在本应用的镜像 PII
 * - shop/redact：归档后清 Turso 全店数据（与卸载清理幂等；保留 PromoClaimLedger）
 * @see https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 */

import prisma from "../../db.server";
import { archiveAndPurgeShopData } from "../shopDataLifecycle/archiveAndPurgeShop.server";

export const COMPLIANCE_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
] as const;

export type ComplianceTopic = (typeof COMPLIANCE_TOPICS)[number];

export type ComplianceWebhookSummary = {
  topic: ComplianceTopic;
  shopDomain?: string;
  shopId?: number;
  customerId?: number;
  dataRequestId?: number;
  orderIds: number[];
};

export type HandleComplianceWebhookResult = {
  handled: boolean;
  summary: ComplianceWebhookSummary | null;
};

const TOPIC_ALIASES: Record<string, ComplianceTopic> = {
  "customers/data_request": "customers/data_request",
  customers_data_request: "customers/data_request",
  "customers/redact": "customers/redact",
  customers_redact: "customers/redact",
  "shop/redact": "shop/redact",
  shop_redact: "shop/redact",
};

export function canonicalizeComplianceTopic(
  topic: string,
): ComplianceTopic | null {
  return TOPIC_ALIASES[topic.trim().toLowerCase()] ?? null;
}

export function isComplianceTopic(topic: string): topic is ComplianceTopic {
  return canonicalizeComplianceTopic(topic) !== null;
}

export function summarizeCompliancePayload(
  topic: string,
  payload: unknown,
): ComplianceWebhookSummary | null {
  const canonical = canonicalizeComplianceTopic(topic);
  if (!canonical) return null;

  const body = asRecord(payload);
  const customer = asRecord(body.customer);
  const dataRequest = asRecord(body.data_request);

  return {
    topic: canonical,
    shopDomain: asOptionalString(body.shop_domain),
    shopId: asFiniteNumber(body.shop_id),
    customerId: asFiniteNumber(customer.id),
    dataRequestId: asFiniteNumber(dataRequest.id),
    orderIds: asNumberArray(body.orders_requested ?? body.orders_to_redact),
  };
}

export async function handleComplianceWebhook(params: {
  shop: string;
  topic: string;
  payload: unknown;
  webhookId?: string;
}): Promise<HandleComplianceWebhookResult> {
  const summary = summarizeCompliancePayload(params.topic, params.payload);
  if (!summary) {
    console.warn(
      `[Webhook] compliance unhandled shop=${params.shop} topic=${params.topic}`,
    );
    return { handled: false, summary: null };
  }

  const shop = (summary.shopDomain ?? params.shop).trim();

  switch (summary.topic) {
    case "customers/data_request":
      console.info("[Webhook] customers/data_request logged", {
        shop,
        webhookId: params.webhookId ?? null,
        ...summary,
      });
      break;
    case "customers/redact":
      await redactCustomerData({
        shop,
        customerId: summary.customerId,
        orderIds: summary.orderIds,
      });
      break;
    case "shop/redact":
      await archiveAndPurgeShopData({
        shop,
        mode: "shop_redact",
        reason: "shop/redact",
      });
      break;
    default: {
      const _exhaustive: never = summary.topic;
      void _exhaustive;
      break;
    }
  }

  console.info("[Webhook] compliance handled", {
    shop,
    webhookId: params.webhookId ?? null,
    topic: summary.topic,
  });
  return { handled: true, summary };
}

async function redactCustomerData(params: {
  shop: string;
  customerId?: number;
  orderIds: number[];
}): Promise<void> {
  const shop = params.shop;
  const customerId =
    params.customerId != null ? String(params.customerId) : null;

  if (customerId) {
    await prisma.shopCustomerValue.deleteMany({
      where: { shop, shopifyCustomerId: customerId },
    });
    await prisma.shopCustomer.deleteMany({
      where: { shop, shopifyCustomerId: customerId },
    });
    await prisma.shopOrder.updateMany({
      where: { shop, shopifyCustomerId: customerId },
      data: {
        email: null,
        customerEmail: null,
        customerFirstName: null,
        customerLastName: null,
        shopifyCustomerId: null,
      },
    });
  }

  for (const orderId of params.orderIds) {
    const shopifyOrderId = String(orderId);
    await prisma.shopOrder.updateMany({
      where: { shop, shopifyOrderId },
      data: {
        email: null,
        customerEmail: null,
        customerFirstName: null,
        customerLastName: null,
        shopifyCustomerId: null,
      },
    });
  }

  console.info(
    `[Webhook] customers/redact done shop=${shop} customerId=${customerId ?? "(none)"} orders=${params.orderIds.length}`,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    const id = asFiniteNumber(item);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}
