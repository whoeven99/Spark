export interface GoogleOfferIdInput {
  sku?: string | null;
  productId: string;
  variantId: string;
}

export interface GoogleOfferIdFixture extends GoogleOfferIdInput {
  expected: string;
}

export const GOOGLE_OFFER_ID_FIXTURES: GoogleOfferIdFixture[] = [
  {
    sku: "  SKU-123  ",
    productId: "gid://shopify/Product/100",
    variantId: "gid://shopify/ProductVariant/200",
    expected: "SKU-123",
  },
  {
    sku: "SKU　内部   空格",
    productId: "gid://shopify/Product/100",
    variantId: "gid://shopify/ProductVariant/200",
    expected: "SKU 内部 空格",
  },
  {
    sku: "商品:/~%",
    productId: "gid://shopify/Product/100",
    variantId: "gid://shopify/ProductVariant/200",
    expected: "商品:/~%",
  },
  {
    sku: " ",
    productId: "gid://shopify/Product/100",
    variantId: "gid://shopify/ProductVariant/200",
    expected: "100-200",
  },
];

function numericId(value: string): string {
  return value.match(/(\d+)$/)?.[1] ?? value;
}

export function normalizeGoogleSku(sku: string | null | undefined): string {
  return (sku ?? "").trim().replace(/\s+/gu, " ");
}

export function resolveGoogleOfferId(input: GoogleOfferIdInput): string {
  return (
    normalizeGoogleSku(input.sku) ||
    `${numericId(input.productId)}-${numericId(input.variantId)}`
  );
}
