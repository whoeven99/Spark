/**
 * Shopify App Store 强制合规 webhook。
 * 当前只校验 HMAC 后 200 确认并记结构化日志，不删除 ShopOrder* / 广告凭证等镜像。
 * @see https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 */

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

export function handleComplianceWebhook(params: {
  shop: string;
  topic: string;
  payload: unknown;
  webhookId?: string;
}): HandleComplianceWebhookResult {
  const summary = summarizeCompliancePayload(params.topic, params.payload);
  if (!summary) {
    console.warn(
      `[Webhook] compliance unhandled shop=${params.shop} topic=${params.topic}`,
    );
    return { handled: false, summary: null };
  }

  console.info("[Webhook] compliance acknowledged (no mutation)", {
    shop: params.shop,
    webhookId: params.webhookId ?? null,
    ...summary,
  });
  return { handled: true, summary };
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
