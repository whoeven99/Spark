import {
  normalizeGoogleConversionLabel,
  normalizeGoogleRemarketingFieldGroups,
} from "./googleRemarketing";

export interface GoogleCustomPixelOptions {
  tagId: string;
  enabledFieldGroups?: unknown;
  /** Google Ads 转化标签；有值时 purchase 额外发 conversion 事件（send_to=AW-ID/label）。 */
  conversionLabel?: unknown;
  /** 是否启用 Enhanced Conversions（用 checkout 邮箱/电话/地址做增强匹配）。 */
  enhancedConversions?: boolean;
  /** 店铺域名（*.myshopify.com），用于 SLS envelope.shopName。 */
  shopName?: string;
  /** 主应用 `/api/pixel-ingest`；缺省时跳过 SLS 双写。 */
  ingestEndpoint?: string;
}

export function generateGooglePurchaseCustomPixel(
  options: GoogleCustomPixelOptions,
): string {
  const tagId = options.tagId.trim().toUpperCase();
  if (!/^AW-\d+$/.test(tagId)) throw new Error("AW 标签必须符合 AW-数字 格式");
  const fieldGroups = normalizeGoogleRemarketingFieldGroups(
    options.enabledFieldGroups,
  );
  const conversionLabel = normalizeGoogleConversionLabel(options.conversionLabel);
  const enhancedConversions = options.enhancedConversions === true;
  const shopName = (options.shopName ?? "").trim().toLowerCase();
  const ingestEndpoint = (options.ingestEndpoint ?? "").trim();
  return `// Spark experimental Google purchase Custom Pixel.
// Google does not officially support Google tags in Shopify Custom Pixels.
const SPARK_CONFIG = ${JSON.stringify({
    tagId,
    fieldGroups,
    conversionLabel,
    enhancedConversions,
    shopName,
    ingestEndpoint,
  })};
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
  gtag('config', SPARK_CONFIG.tagId, SPARK_CONFIG.enhancedConversions ? {send_page_view:false, allow_enhanced_conversions:true} : {send_page_view:false});
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(SPARK_CONFIG.tagId);
  document.head.appendChild(script);
}
async function resolveClientId() {
  try {
    if (typeof browser !== 'undefined' && browser.cookie && typeof browser.cookie.get === 'function') {
      const y = await browser.cookie.get('_shopify_y');
      if (y) return String(y);
    }
  } catch (e) {}
  return 'custom-pixel-' + String(Date.now());
}
function resolveTrafficSource(event) {
  try {
    const href = (event && event.context && event.context.document && event.context.document.location && event.context.document.location.href) || '';
    const referrer = (event && event.context && event.context.document && event.context.document.referrer) || '';
    const url = href ? new URL(href) : null;
    const params = url ? url.searchParams : null;
    if (params && (params.get('gclid') || params.get('gbraid') || params.get('wbraid'))) return 'paid';
    const medium = ((params && params.get('utm_medium')) || '').toLowerCase();
    if (medium === 'cpc' || medium === 'ppc' || medium === 'paid') return 'paid';
    if (referrer) return 'organic';
    return 'direct';
  } catch (e) {
    return 'unknown';
  }
}
function mirrorPurchase(event, payload, sentToGoogle) {
  if (!SPARK_CONFIG.ingestEndpoint || !SPARK_CONFIG.shopName) return;
  resolveClientId().then((clientId) => {
    let pagePath = '';
    let pageUrl = '';
    let referrer = '';
    let gclid = '';
    let utmSource = '';
    let utmMedium = '';
    try {
      const loc = event && event.context && event.context.document && event.context.document.location;
      pageUrl = (loc && loc.href) || '';
      pagePath = (loc && loc.pathname) || '';
      referrer = (event.context.document.referrer) || '';
      if (pageUrl) {
        const params = new URL(pageUrl).searchParams;
        gclid = params.get('gclid') || '';
        utmSource = params.get('utm_source') || '';
        utmMedium = params.get('utm_medium') || '';
      }
    } catch (e) {}
    const productId = payload.items && payload.items[0] ? String(payload.items[0].id || '') : '';
    const envelope = {
      ts: Date.now(),
      event: 'spark:google:purchase',
      schemaVersion: 1,
      shopName: SPARK_CONFIG.shopName,
      clientId: clientId,
      source: 'custom-pixel:google-purchase',
      productId: productId || undefined,
      payload: {
        googleEvent: 'purchase',
        sentToGoogle: !!sentToGoogle,
        pixelId: SPARK_CONFIG.tagId,
        conversionLabel: SPARK_CONFIG.conversionLabel || '',
        account: SPARK_CONFIG.tagId,
        pagePath: pagePath,
        pageUrl: pageUrl,
        referrer: referrer,
        trafficSource: resolveTrafficSource(event),
        gclid: gclid || undefined,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        value: payload.value,
        currency: payload.currency,
        items: payload.items,
        transaction_id: payload.transaction_id,
        enhancedConversions: !!SPARK_CONFIG.enhancedConversions,
        consent: { marketing: marketingAllowed ? 'granted' : 'denied' },
      },
    };
    try {
      fetch(SPARK_CONFIG.ingestEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(envelope),
        keepalive: true,
        credentials: 'omit',
        mode: 'cors',
      }).catch(function () {});
    } catch (err) {}
  });
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
  let sentToGoogle = false;
  if (marketingAllowed) {
    loadTag();
    if (SPARK_CONFIG.enhancedConversions) {
      const billing = checkout.billingAddress || {};
      const userData = {};
      if (checkout.email) userData.email = String(checkout.email);
      if (checkout.phone || billing.phone) userData.phone_number = String(checkout.phone || billing.phone);
      if (billing.firstName || billing.lastName || billing.address1) {
        userData.address = {
          first_name: billing.firstName || undefined,
          last_name: billing.lastName || undefined,
          street: billing.address1 || undefined,
          city: billing.city || undefined,
          region: billing.provinceCode || billing.province || undefined,
          postal_code: billing.zip || undefined,
          country: billing.countryCode || billing.country || undefined,
        };
      }
      if (Object.keys(userData).length > 0) gtag('set', 'user_data', userData);
    }
    gtag('event', 'purchase', payload);
    if (SPARK_CONFIG.conversionLabel) {
      gtag('event', 'conversion', {
        send_to: SPARK_CONFIG.tagId + '/' + SPARK_CONFIG.conversionLabel,
        value: payload.value,
        currency: payload.currency,
        transaction_id: transactionId,
      });
    }
    sentToGoogle = true;
  }
  // SLS 双写不带 Enhanced Conversions PII；consent denied 时仍记一条 purchase 尝试。
  mirrorPurchase(event, payload, sentToGoogle);
});`;
}
