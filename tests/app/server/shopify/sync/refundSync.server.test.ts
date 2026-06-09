import { describe, expect, it } from "vitest";
import {
  isFullShippingRefund,
  parseShippingRefundFromPayload,
  sumDiscountedShippingFromLines,
} from "../../../../../app/server/shopify/sync/refundSyncParse.server";

describe("parseShippingRefundFromPayload", () => {
  it("reads partial shipping refund from refund_shipping_lines (Shopify 2024-10+)", () => {
    const totals = parseShippingRefundFromPayload({
      refund_shipping_lines: [
        {
          subtotal_amount_set: { shop_money: { amount: "2.00" } },
          tax_amount_set: { shop_money: { amount: "0.00" } },
        },
      ],
      order_adjustments: [
        {
          id: 1,
          order_id: 1,
          refund_id: 1,
          kind: "shipping_refund",
          amount: "5.00",
          tax_amount: "0.00",
          reason: null,
        },
      ],
    });

    expect(totals).toEqual({
      shippingRefundAmount: 2,
      shippingRefundTax: 0,
    });
  });

  it("falls back to legacy order_adjustments when refund_shipping_lines is empty", () => {
    const totals = parseShippingRefundFromPayload({
      refund_shipping_lines: [],
      order_adjustments: [
        {
          id: 1,
          order_id: 1,
          refund_id: 1,
          kind: "shipping_refund",
          amount: "-3.50",
          tax_amount: "0.50",
          reason: null,
        },
      ],
    });

    expect(totals).toEqual({
      shippingRefundAmount: 3.5,
      shippingRefundTax: 0.5,
    });
  });

  it("nets partial shipping refund from shipping_refund minus refund_discrepancy", () => {
    const totals = parseShippingRefundFromPayload({
      refund_shipping_lines: [],
      order_adjustments: [
        {
          id: 332011733015,
          order_id: 7163234353175,
          refund_id: 965339611159,
          kind: "shipping_refund",
          amount: "-3.47",
          tax_amount: "0.00",
          reason: "Shipping refund",
          amount_set: { shop_money: { amount: "-3.47" } },
        },
        {
          id: 332011765783,
          order_id: 7163234353175,
          refund_id: 965339611159,
          kind: "refund_discrepancy",
          amount: "2.60",
          tax_amount: "0.00",
          reason: "Refund discrepancy",
          amount_set: { shop_money: { amount: "2.60" } },
        },
      ],
    });

    expect(totals.shippingRefundAmount).toBeCloseTo(0.87, 2);
    expect(totals.shippingRefundTax).toBe(0);
    expect(isFullShippingRefund(totals.shippingRefundAmount, 0, 3.47)).toBe(
      false,
    );
  });

  it("ignores non-shipping order_adjustments in legacy fallback", () => {
    const totals = parseShippingRefundFromPayload({
      order_adjustments: [
        {
          id: 1,
          order_id: 1,
          refund_id: 1,
          kind: "refund_discrepancy",
          amount: "3.47",
          tax_amount: "0.00",
          reason: "refund_discrepancy",
        },
      ],
    });

    expect(totals).toEqual({
      shippingRefundAmount: 0,
      shippingRefundTax: 0,
    });
  });
});

describe("isFullShippingRefund", () => {
  it("returns true when refunded shipping plus tax covers original shipping", () => {
    expect(isFullShippingRefund(3.47, 0, 3.47)).toBe(true);
    expect(isFullShippingRefund(2, 1.47, 3.47)).toBe(true);
  });

  it("returns false for partial shipping refund", () => {
    expect(isFullShippingRefund(2, 0, 5)).toBe(false);
    expect(isFullShippingRefund(2, 0, 3.47)).toBe(false);
  });

  it("returns false when original shipping is zero", () => {
    expect(isFullShippingRefund(2, 0, 0)).toBe(false);
  });
});

describe("sumDiscountedShippingFromLines", () => {
  it("sums discounted shop_money amounts from shipping lines", () => {
    expect(
      sumDiscountedShippingFromLines([
        {
          discounted_price_set: { shop_money: { amount: "3.00" } },
        },
        {
          discounted_price_set: { shop_money: { amount: "2.47" } },
        },
      ]),
    ).toBeCloseTo(5.47, 2);
  });

  it("falls back to total_shipping_price_set when no shipping lines", () => {
    expect(sumDiscountedShippingFromLines([])).toBe(0);
  });
});
