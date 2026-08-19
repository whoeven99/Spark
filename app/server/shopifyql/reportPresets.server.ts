import { interpolateSince, type RangeKey, type ReportPresetKind, type ReportTab } from "../../lib/shopifyReports";

export type ReportPreset = {
  id: string;
  kind: ReportPresetKind;
  titleKey: string;
  query: string;
  seriesKeys: string[];
  xKey: string;
};

const PRESETS: Record<ReportTab, ReportPreset[]> = {
  sales: [
    {
      id: "sales-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM sales SHOW total_sales, net_sales, orders, average_order_value, discounts, returns SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "sales-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendSales",
      query:
        "FROM sales SHOW total_sales, orders TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["total_sales", "orders"],
      xKey: "day",
    },
    {
      id: "sales-channel",
      kind: "table",
      titleKey: "shopifyReports.tableSalesChannel",
      query:
        "FROM sales SHOW total_sales, orders GROUP BY sales_channel SINCE {{SINCE}} UNTIL today ORDER BY total_sales DESC LIMIT 20",
      seriesKeys: [],
      xKey: "sales_channel",
    },
    {
      id: "sales-product",
      kind: "table",
      titleKey: "shopifyReports.tableSalesProduct",
      query:
        "FROM sales SHOW net_sales, orders GROUP BY product_title SINCE {{SINCE}} UNTIL today ORDER BY net_sales DESC LIMIT 20",
      seriesKeys: [],
      xKey: "product_title",
    },
  ],
  refunds: [
    {
      id: "refunds-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM sales SHOW returns, net_returns, total_returns, reversed_quantity SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "refunds-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendRefunds",
      query:
        "FROM returns SHOW returned_quantity TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["returned_quantity"],
      xKey: "day",
    },
    {
      id: "refunds-status",
      kind: "table",
      titleKey: "shopifyReports.tableReturnStatus",
      query:
        "FROM returns SHOW returned_quantity GROUP BY return_status SINCE {{SINCE}} UNTIL today ORDER BY returned_quantity DESC LIMIT 20",
      seriesKeys: [],
      xKey: "return_status",
    },
    {
      id: "refunds-product",
      kind: "table",
      titleKey: "shopifyReports.tableReturnProduct",
      query:
        "FROM returns SHOW returned_quantity GROUP BY product_title_at_time_of_sale SINCE {{SINCE}} UNTIL today ORDER BY returned_quantity DESC LIMIT 20",
      seriesKeys: [],
      xKey: "product_title_at_time_of_sale",
    },
  ],
  customers: [
    {
      id: "customers-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM customers SHOW new_customer_records, total_amount_spent, total_number_of_orders, total_amount_spent_per_order, days_since_last_order SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "customers-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendCustomers",
      query:
        "FROM customers SHOW new_customer_records TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["new_customer_records"],
      xKey: "day",
    },
    {
      id: "customers-month",
      kind: "table",
      titleKey: "shopifyReports.tableCustomerMonth",
      query:
        "FROM customers SHOW new_customer_records, total_amount_spent GROUP BY month SINCE {{SINCE}} UNTIL today ORDER BY month ASC LIMIT 24",
      seriesKeys: [],
      xKey: "month",
    },
  ],
  inventory: [
    {
      id: "inventory-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM inventory SHOW ending_inventory_units, ending_inventory_value, inventory_units_sold, sell_through_rate, days_of_inventory_remaining WHERE inventory_is_tracked = true SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "inventory-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendInventory",
      query:
        "FROM inventory SHOW ending_inventory_units, inventory_units_sold TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["ending_inventory_units", "inventory_units_sold"],
      xKey: "day",
    },
    {
      id: "inventory-sku",
      kind: "table",
      titleKey: "shopifyReports.tableInventorySku",
      query:
        "FROM inventory SHOW ending_inventory_units, ending_inventory_value, sell_through_rate WHERE inventory_is_tracked = true GROUP BY product_title, product_variant_sku SINCE {{SINCE}} UNTIL today ORDER BY ending_inventory_value DESC LIMIT 20",
      seriesKeys: [],
      xKey: "product_title",
    },
    {
      id: "inventory-adjustments",
      kind: "table",
      titleKey: "shopifyReports.tableInventoryAdjustments",
      query:
        "FROM inventory_adjustment_history SHOW inventory_adjustment_change, inventory_adjustment_count GROUP BY inventory_change_reason SINCE {{SINCE}} UNTIL today ORDER BY inventory_adjustment_count DESC LIMIT 20",
      seriesKeys: [],
      xKey: "inventory_change_reason",
    },
  ],
  fulfillment: [
    {
      id: "fulfillment-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM fulfillments SHOW orders_fulfilled, orders_shipped, orders_delivered, median_hours_order_to_fulfillment, orders_shipped_fast_rate, orders_with_tracking_included_rate SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "fulfillment-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendFulfillment",
      query:
        "FROM fulfillments SHOW orders_fulfilled, orders_shipped TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["orders_fulfilled", "orders_shipped"],
      xKey: "day",
    },
    {
      id: "fulfillment-carrier",
      kind: "table",
      titleKey: "shopifyReports.tableFulfillmentCarrier",
      query:
        "FROM fulfillments SHOW orders_fulfilled, orders_shipped, median_hours_order_to_fulfillment GROUP BY shipping_carrier SINCE {{SINCE}} UNTIL today ORDER BY orders_fulfilled DESC LIMIT 20",
      seriesKeys: [],
      xKey: "shipping_carrier",
    },
  ],
  storefront: [
    {
      id: "storefront-summary",
      kind: "summary",
      titleKey: "shopifyReports.summaryTitle",
      query:
        "FROM sessions SHOW sessions, pageviews, conversion_rate, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE {{SINCE}} UNTIL today",
      seriesKeys: [],
      xKey: "day",
    },
    {
      id: "storefront-trend",
      kind: "timeseries",
      titleKey: "shopifyReports.trendSessions",
      query:
        "FROM sessions SHOW sessions, conversion_rate TIMESERIES day SINCE {{SINCE}} UNTIL today ORDER BY day ASC",
      seriesKeys: ["sessions", "conversion_rate"],
      xKey: "day",
    },
    {
      id: "storefront-referrer",
      kind: "table",
      titleKey: "shopifyReports.tableSessionReferrer",
      query:
        "FROM sessions SHOW sessions, conversion_rate GROUP BY referrer_source SINCE {{SINCE}} UNTIL today ORDER BY sessions DESC LIMIT 20",
      seriesKeys: [],
      xKey: "referrer_source",
    },
  ],
};

export function listReportPresets(tab: ReportTab): ReportPreset[] {
  return PRESETS[tab];
}

export function buildPresetQuery(preset: ReportPreset, range: RangeKey): string {
  return interpolateSince(preset.query, range);
}
