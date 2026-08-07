import {
  normalizeGoogleRemarketingFieldGroups,
} from "./googleRemarketing";

export interface GoogleCustomPixelOptions {
  tagId: string;
  enabledFieldGroups?: unknown;
}

export function generateGooglePurchaseCustomPixel(
  options: GoogleCustomPixelOptions,
): string {
  const tagId = options.tagId.trim().toUpperCase();
  if (!/^AW-\d+$/.test(tagId)) throw new Error("AW 标签必须符合 AW-数字 格式");
  const fieldGroups = normalizeGoogleRemarketingFieldGroups(
    options.enabledFieldGroups,
  );
  return `// Spark experimental Google purchase Custom Pixel.
// Google does not officially support Google tags in Shopify Custom Pixels.
const SPARK_CONFIG = ${JSON.stringify({ tagId, fieldGroups })};
const completedTransactions = new Set();
let marketingAllowed = Boolean(init.customerPrivacy && init.customerPrivacy.marketingAllowed);
let loaded = false;
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('consent', 'default', {ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
function numericId(value) {
  const match = String(value || '').match(/(\\d+)$/);
  return match ? match[1] : String(value || '');
}
function offerId(line) {
  const variant = line.variant || line.merchandise || {};
  const product = variant.product || line.product || {};
  const sku = String(variant.sku || line.sku || '').trim().replace(/\\s+/g, ' ');
  return sku || numericId(product.id) + '-' + numericId(variant.id);
}
function loadTag() {
  if (loaded || !marketingAllowed) return;
  loaded = true;
  gtag('consent', 'update', {ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});
  gtag('js', new Date());
  gtag('config', SPARK_CONFIG.tagId, {send_page_view:false});
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(SPARK_CONFIG.tagId);
  document.head.appendChild(script);
}
// Custom Pixel 沙箱没有全局 customerPrivacy，必须用 api.customerPrivacy。
if (api && api.customerPrivacy && typeof api.customerPrivacy.subscribe === 'function') {
  api.customerPrivacy.subscribe('visitorConsentCollected', (event) => {
    marketingAllowed = Boolean(event.customerPrivacy && event.customerPrivacy.marketingAllowed);
    if (marketingAllowed) loadTag();
    else gtag('consent', 'update', {ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  });
}
loadTag();
analytics.subscribe('checkout_completed', (event) => {
  if (!marketingAllowed) return;
  loadTag();
  const checkout = event.data && event.data.checkout ? event.data.checkout : {};
  const transactionId = String((checkout.order && checkout.order.id) || checkout.token || event.id || '');
  if (!transactionId || completedTransactions.has(transactionId)) return;
  completedTransactions.add(transactionId);
  const lines = Array.isArray(checkout.lineItems) ? checkout.lineItems : [];
  const items = lines.map((line) => {
    const id = offerId(line);
    const item = {id, item_id:id, google_business_vertical:'retail'};
    if (SPARK_CONFIG.fieldGroups.includes('product')) {
      item.item_name = line.title || (line.variant && line.variant.title) || undefined;
      item.price = Number(line.finalLinePrice && line.finalLinePrice.amount || line.price && line.price.amount || 0);
      item.quantity = Number(line.quantity || 1);
    }
    return item;
  });
  const total = checkout.totalPrice || {};
  const payload = {transaction_id:transactionId, value:Number(total.amount || 0), currency:total.currencyCode, items};
  if (SPARK_CONFIG.fieldGroups.includes('legacy_ecomm')) {
    payload.ecomm_prodid = items.map((item) => item.id);
    payload.ecomm_pagetype = 'purchase';
    payload.ecomm_totalvalue = payload.value;
  }
  gtag('event', 'purchase', payload);
});`;
}
