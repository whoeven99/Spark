import type { BatchTaskProduct } from "./batchTasksFormPayload";

const PRODUCT_LINE_RE =
  /^\s*•\s+(.+)\s+\[ID:\s*([^\]]+)\](?:\s+\[图片:\s*([^\]]+)\])?\s*$/;

export function normalizeShopifyProductId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gid://")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return trimmed;
}

/** 从 augment 后的用户消息（含 [工作台上下文]）解析已选商品。 */
export function parseWorkspaceProductsFromText(text: string): BatchTaskProduct[] {
  const products: BatchTaskProduct[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const match = line.match(PRODUCT_LINE_RE);
    if (!match) continue;
    const title = match[1].trim();
    const id = normalizeShopifyProductId(match[2]);
    const imageUrl = match[3]?.trim() || null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    products.push({ id, title: title || "未知商品", imageUrl });
  }

  return products;
}

export function selectedShopifyObjectsToBatchProducts(
  items: Array<{ id: string; title: string; imageUrl?: string | null }>,
): BatchTaskProduct[] {
  return items.map((item) => ({
    id: normalizeShopifyProductId(item.id),
    title: item.title || "未知商品",
    imageUrl: item.imageUrl ?? null,
  }));
}
