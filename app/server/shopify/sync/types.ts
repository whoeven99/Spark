// Shopify REST webhook payload 类型定义

export interface ShopifyLineItem {
  id: number;
  variant_id: number | null;
  product_id: number | null;
  inventory_item_id?: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  total_discount: string;
  vendor: string | null;
}

export interface ShopifyCustomerInOrder {
  id: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: string;
  first_order_date?: string | null;
  state: string | null;
  tags: string;
  accepts_marketing: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrderPayload {
  id: number;
  order_number: number;
  email: string | null;
  phone: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  currency: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money?: { amount: string };
  };
  shipping_lines?: Array<{
    discounted_price_set?: { shop_money?: { amount: string } };
    discounted_price?: string;
    price?: string;
  }>;
  source_name: string | null;
  landing_site: string | null;
  referring_site: string | null;
  tags: string;
  customer: ShopifyCustomerInOrder | null;
  line_items: ShopifyLineItem[];
}

export interface ShopifyRefundTransaction {
  id: number;
  order_id: number;
  kind: string;
  status: string;
  amount: string;
}

export interface ShopifyRefundOrderAdjustment {
  id: number;
  order_id: number;
  refund_id: number;
  /// shipping_refund | refund_discrepancy
  kind: string;
  amount: string;
  tax_amount: string;
  reason: string | null;
  amount_set?: {
    shop_money?: { amount: string };
    presentment_money?: { amount: string };
  };
  tax_amount_set?: {
    shop_money?: { amount: string };
    presentment_money?: { amount: string };
  };
}

export interface ShopifyRefundPayload {
  id: number;
  order_id: number;
  created_at: string;
  processed_at: string | null;
  note: string | null;
  refund_line_items: Array<{
    id: number;
    quantity: number;
    line_item_id: number;
    restock_type?: string | null;
    reason?: string | null;
    subtotal: string;
    total_tax: string;
    line_item?: ShopifyLineItem | null;
  }>;
  transactions: ShopifyRefundTransaction[];
  order_adjustments?: ShopifyRefundOrderAdjustment[];
  refund_shipping_lines?: Array<{
    subtotal_amount_set?: { shop_money?: { amount: string } };
    subtotal_set?: { shop_money?: { amount: string } };
    tax_amount_set?: { shop_money?: { amount: string } };
  }>;
}

export interface ShopifyInventoryLevelPayload {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at: string;
}

export interface ShopifyFulfillmentPayload {
  id: number;
  order_id: number;
  status: string;
  created_at: string;
  updated_at: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipment_status: string | null;
  line_items?: ShopifyLineItem[];
}

export interface BackfillResult {
  synced: number;
  skipped: number;
  errors: number;
  cursor: string | null;
}
