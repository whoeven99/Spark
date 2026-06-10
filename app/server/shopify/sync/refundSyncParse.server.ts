import type {
  ShopifyRefundOrderAdjustment,
  ShopifyRefundPayload,
} from "./types";

export function parseMoney(value: string | null | undefined): number {
  return parseFloat(value ?? "0") || 0;
}

export type ShippingRefundTotals = {
  shippingRefundAmount: number;
  shippingRefundTax: number;
};

function shopMoneyAmount(
  primary: string | null | undefined,
  moneySet?: { shop_money?: { amount: string } },
): number {
  return Math.abs(parseMoney(moneySet?.shop_money?.amount ?? primary));
}

function adjustmentShopMoneyAmount(adj: ShopifyRefundOrderAdjustment): number {
  return shopMoneyAmount(adj.amount, adj.amount_set);
}

function adjustmentShopMoneyTax(adj: ShopifyRefundOrderAdjustment): number {
  return shopMoneyAmount(adj.tax_amount, adj.tax_amount_set);
}

function parseRefundShippingLines(
  lines: NonNullable<ShopifyRefundPayload["refund_shipping_lines"]>,
): ShippingRefundTotals | null {
  if (lines.length === 0) return null;

  const shippingRefundAmount = lines.reduce((sum, line) => {
    const amount =
      line.subtotal_amount_set?.shop_money?.amount ??
      line.subtotal_set?.shop_money?.amount;
    return sum + Math.abs(parseMoney(amount));
  }, 0);
  const shippingRefundTax = lines.reduce(
    (sum, line) =>
      sum + Math.abs(parseMoney(line.tax_amount_set?.shop_money?.amount)),
    0,
  );

  if (shippingRefundAmount <= 0 && shippingRefundTax <= 0) return null;
  return { shippingRefundAmount, shippingRefundTax };
}

/**
 * Legacy webhooks may only expose order_adjustments. For partial shipping refunds
 * Shopify records the full shipping line on shipping_refund and offsets the
 * remainder on refund_discrepancy — net = shipping_refund - refund_discrepancy.
 */
function parseLegacyShippingRefundFromAdjustments(
  adjustments: ShopifyRefundOrderAdjustment[],
): ShippingRefundTotals {
  const shippingAdjustments = adjustments.filter(
    (adj) => adj.kind === "shipping_refund",
  );
  if (shippingAdjustments.length === 0) {
    return { shippingRefundAmount: 0, shippingRefundTax: 0 };
  }

  const shippingRefundAmount = shippingAdjustments.reduce(
    (sum, adj) => sum + adjustmentShopMoneyAmount(adj),
    0,
  );
  const shippingRefundTax = shippingAdjustments.reduce(
    (sum, adj) => sum + adjustmentShopMoneyTax(adj),
    0,
  );

  const discrepancyAmount = adjustments
    .filter((adj) => adj.kind === "refund_discrepancy")
    .reduce((sum, adj) => sum + adjustmentShopMoneyAmount(adj), 0);

  if (discrepancyAmount > 0) {
    return {
      shippingRefundAmount: Math.max(0, shippingRefundAmount - discrepancyAmount),
      shippingRefundTax,
    };
  }

  return { shippingRefundAmount, shippingRefundTax };
}

/** Shopify 2024-10+ uses refund_shipping_lines; legacy webhooks use order_adjustments. */
export function parseShippingRefundFromPayload(
  payload: Pick<
    ShopifyRefundPayload,
    "refund_shipping_lines" | "order_adjustments"
  >,
): ShippingRefundTotals {
  const fromShippingLines = parseRefundShippingLines(
    payload.refund_shipping_lines ?? [],
  );
  if (fromShippingLines) return fromShippingLines;

  return parseLegacyShippingRefundFromAdjustments(
    payload.order_adjustments ?? [],
  );
}

/** Compare refunded shipping (+ tax) against original order shipping baseline. */
export function isFullShippingRefund(
  shippingRefundAmount: number,
  shippingRefundTax: number,
  originalShipping: number,
): boolean {
  if (originalShipping <= 0) return false;
  const refundedTotal = shippingRefundAmount + shippingRefundTax;
  return refundedTotal + 0.005 >= originalShipping;
}

export function sumDiscountedShippingFromLines(
  shippingLines: Array<{
    discounted_price_set?: { shop_money?: { amount: string } };
    discounted_price?: string;
    price?: string;
  }>,
): number {
  if (shippingLines.length === 0) return 0;
  return shippingLines.reduce((sum, line) => {
    const amount =
      line.discounted_price_set?.shop_money?.amount ??
      line.discounted_price ??
      line.price ??
      "0";
    return sum + parseMoney(amount);
  }, 0);
}
