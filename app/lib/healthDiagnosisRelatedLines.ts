const RELATED_LINE_LIMIT = 5;

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rounded(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function orderLabel(row: Record<string, unknown>, locale: "zh" | "en"): string | null {
  const number = text(row.orderNumber).replace(/^#/, "");
  if (!number) return null;
  const parts = [`#${number}`];
  const ageHours = rounded(row.ageHours);
  const ageDays = rounded(row.ageDays);
  if (ageHours != null) {
    parts.push(locale === "zh" ? `超时 ${ageHours} 小时` : `${ageHours}h overdue`);
  } else if (ageDays != null) {
    parts.push(locale === "zh" ? `在途 ${ageDays} 天` : `${ageDays}d in transit`);
  }
  const status = text(row.fulfillmentStatus) || text(row.shipmentStatus);
  if (status) parts.push(status);
  return parts.join(" · ");
}

function skuLabel(row: Record<string, unknown>, locale: "zh" | "en"): string | null {
  const sku = text(row.sku) || text(row.title);
  if (!sku) return null;
  const title = text(row.title);
  const available = rounded(row.available);
  const parts = [title && title !== sku ? `${sku} ${title}` : sku];
  if (available != null) {
    parts.push(locale === "zh" ? `库存 ${available}` : `stock ${available}`);
  }
  return parts.join(" · ");
}

function collectRows(related: Record<string, unknown>): unknown[] {
  const preferred = ["orders", "shipments", "skus", "products", "inventoryRisks"];
  const rows: unknown[] = [];
  for (const key of preferred) {
    const value = related[key];
    if (Array.isArray(value)) rows.push(...value);
  }
  if (rows.length > 0) return rows;
  for (const value of Object.values(related)) {
    if (Array.isArray(value)) rows.push(...value);
  }
  return rows;
}

/** 把诊断 relatedObjects 压成卡上/追问可用的短句，最多 5 条。 */
export function summarizeDiagnosisRelatedLines(
  relatedObjects: unknown,
  locale: "zh" | "en",
  limit = RELATED_LINE_LIMIT,
): string[] {
  const related = asRecord(relatedObjects);
  if (!related) return [];
  const lines: string[] = [];
  for (const item of collectRows(related)) {
    const row = asRecord(item);
    if (!row) continue;
    const line = orderLabel(row, locale) ?? skuLabel(row, locale);
    if (!line) continue;
    lines.push(line);
    if (lines.length >= limit) break;
  }
  return lines;
}
