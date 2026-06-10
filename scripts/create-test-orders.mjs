// Usage: npm run orders:create
// 交互式创建测试订单（test: true），流程：pending 创建 → orderMarkAsPaid → 等待 webhook → 可选 cancel/refund。
// 前置：店铺已安装 Order Monitor，webhook 指向可达实例
// 可选环境变量 SYNC_WAIT_MS（默认 5000）：mark paid 后等待 orders/paid 写入 Turso 的毫秒数。

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes } from "node:crypto";

const API_VERSION = "2026-07";
const DEFAULT_SYNC_WAIT_MS = 5000;

const ADDRESSES = [
  { city: "Ottawa", province: "Ontario", province_code: "ON", country: "Canada", country_code: "CA", zip: "K1N5T5" },
  { city: "New York", province: "New York", province_code: "NY", country: "United States", country_code: "US", zip: "10001" },
  { city: "Los Angeles", province: "California", province_code: "CA", country: "United States", country_code: "US", zip: "90001" },
  { city: "London", province: "England", province_code: "ENG", country: "United Kingdom", country_code: "GB", zip: "SW1A 1AA" },
  { city: "Sydney", province: "New South Wales", province_code: "NSW", country: "Australia", country_code: "AU", zip: "2000" },
];

const FIRST_NAMES = ["Alex", "Jamie", "Taylor", "Jordan", "Casey", "Morgan", "Riley", "Sam"];
const LAST_NAMES = ["Smith", "Johnson", "Lee", "Brown", "Garcia", "Miller", "Davis", "Wilson"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHex(n) {
  return randomBytes(n).toString("hex");
}

function randomEmail() {
  return `spark-test-${randomHex(3)}@example.com`;
}

function randomAddress() {
  const base = pick(ADDRESSES);
  return {
    first_name: pick(FIRST_NAMES),
    last_name: `${pick(LAST_NAMES)}-${randomHex(2)}`,
    address1: `${Math.floor(Math.random() * 9000) + 100} Test St`,
    city: base.city,
    province: base.province,
    province_code: base.province_code,
    country: base.country,
    country_code: base.country_code,
    zip: base.zip,
    phone: "+1-555-0100",
  };
}

function resolveSyncWaitMs() {
  const raw = process.env.SYNC_WAIT_MS;
  if (raw === undefined || raw === "") return DEFAULT_SYNC_WAIT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`SYNC_WAIT_MS 必须为非负整数，收到: ${raw}`);
  }
  return parsed;
}

function normalizeShop(raw) {
  let s = raw.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!s) throw new Error("Store domain 不能为空");
  if (!/\.myshopify\.com$/.test(s)) {
    throw new Error(`Store domain 必须以 .myshopify.com 结尾，收到: ${s}`);
  }
  return s;
}

async function fetchFirstInStockVariant(shop, token) {
  const query = `
    {
      products(first: 100) {
        edges {
          node {
            title
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  `;
  const res = await shopifyFetch(shop, token, `/graphql.json`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  const products = json?.data?.products?.edges ?? [];
  for (const pEdge of products) {
    const productTitle = pEdge?.node?.title ?? "(untitled)";
    const variants = pEdge?.node?.variants?.edges ?? [];
    for (const vEdge of variants) {
      const v = vEdge?.node;
      const qty = Number(v?.inventoryQuantity ?? 0);
      if (qty > 0 && v?.id) {
        const numericId = String(v.id).split("/").pop();
        return { productTitle, variantTitle: v.title ?? "", variantId: numericId, inventoryQuantity: qty };
      }
    }
  }
  throw new Error("店铺无有库存 variant（请先在测试店创建一个 inventoryQuantity > 0 的商品）");
}

const ORDER_STATES = ["paid", "cancelled", "refunded", "unfulfilled"];

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyFetch(shop, token, path, init = {}) {
  let attempt = 0;
  while (true) {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        ...(init.headers ?? {}),
      },
    });
    if (res.status !== 429 || attempt >= RATE_LIMIT_MAX_RETRIES) return res;
    const retryAfterHeader = Number.parseFloat(res.headers.get("retry-after") ?? "");
    const backoff = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
    attempt++;
    console.log(`  ⚠ 429 rate limited, retry ${attempt}/${RATE_LIMIT_MAX_RETRIES} after ${Math.round(backoff)}ms`);
    await sleep(backoff);
  }
}

async function shopifyJson(shop, token, path, init) {
  const res = await shopifyFetch(shop, token, path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${init?.method ?? "GET"} ${path}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function shopifyGraphql(shop, token, query, variables) {
  const res = await shopifyFetch(shop, token, `/graphql.json`, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text);
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return json;
}

async function markOrderAsPaid(shop, token, orderId) {
  const mutation = `
    mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
      orderMarkAsPaid(input: $input) {
        order {
          id
          displayFinancialStatus
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const json = await shopifyGraphql(shop, token, mutation, {
    input: { id: `gid://shopify/Order/${orderId}` },
  });
  const result = json?.data?.orderMarkAsPaid;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join("; "));
  }
  const status = result?.order?.displayFinancialStatus;
  if (status && status !== "PAID") {
    throw new Error(`orderMarkAsPaid 后 financial status 为 ${status}，期望 PAID`);
  }
}

async function createOrder(shop, token, variantId) {
  // 先 pending 创建；由 markOrderAsPaid 产生支付 transaction，触发 orders/paid webhook。
  const email = randomEmail();
  const shippingAddress = randomAddress();
  const body = {
    order: {
      email,
      financial_status: "pending",
      test: true,
      line_items: [{ variant_id: Number(variantId), quantity: 1 }],
      shipping_address: shippingAddress,
      customer: {
        email,
        first_name: shippingAddress.first_name,
        last_name: shippingAddress.last_name,
      },
    },
  };
  const json = await shopifyJson(shop, token, `/orders.json`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return json?.order;
}

async function cancelOrder(shop, token, orderId) {
  await shopifyJson(shop, token, `/orders/${orderId}/cancel.json`, {
    method: "POST",
    body: JSON.stringify({ reason: "other", email: false, refund: false }),
  });
}

async function refundOrder(shop, token, orderId) {
  const order = (await shopifyJson(shop, token, `/orders/${orderId}.json`, { method: "GET" }))?.order;
  const lineItems = (order?.line_items ?? []).map((li) => ({
    line_item_id: li.id,
    quantity: li.quantity,
    restock_type: "no_restock",
  }));
  if (lineItems.length === 0) throw new Error("订单无 line_items 可退款");

  const calc = await shopifyJson(shop, token, `/orders/${orderId}/refunds/calculate.json`, {
    method: "POST",
    body: JSON.stringify({
      refund: { shipping: { full_refund: true }, refund_line_items: lineItems },
    }),
  });
  const transactions = (calc?.refund?.transactions ?? []).map((t) => ({
    parent_id: t.parent_id,
    amount: t.amount,
    kind: "refund",
    gateway: t.gateway,
  }));

  await shopifyJson(shop, token, `/orders/${orderId}/refunds.json`, {
    method: "POST",
    body: JSON.stringify({
      refund: {
        notify: false,
        shipping: { full_refund: true },
        refund_line_items: lineItems,
        transactions,
      },
    }),
  });
}

async function createOrderWithState(shop, token, variantId, state, syncWaitMs) {
  const order = await createOrder(shop, token, variantId);
  if (!order?.id) return order;

  await markOrderAsPaid(shop, token, order.id);
  await sleep(syncWaitMs);

  if (state === "cancelled") {
    await cancelOrder(shop, token, order.id);
  } else if (state === "refunded") {
    await refundOrder(shop, token, order.id);
  }
  // "paid" 与 "unfulfilled"：mark paid 后即为 paid + unfulfilled
  return order;
}

async function main() {
  const syncWaitMs = resolveSyncWaitMs();
  const rl = createInterface({ input, output });
  try {
    const shopRaw = await rl.question("Store domain (e.g. my-store.myshopify.com): ");
    const shop = normalizeShop(shopRaw);

    const token = (await rl.question("Admin Access Token: ")).trim();
    if (!token) throw new Error("Access Token 不能为空");

    const countRaw = (await rl.question("Number of orders [1]: ")).trim();
    const count = countRaw === "" ? 1 : Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1) {
      throw new Error(`订单数量必须为正整数，收到: ${countRaw}`);
    }

    console.log(`\n→ Webhook 同步等待: ${syncWaitMs}ms (SYNC_WAIT_MS 可调)`);
    console.log(`→ Fetching first in-stock variant from ${shop} ...`);
    const { productTitle, variantTitle, variantId, inventoryQuantity } = await fetchFirstInStockVariant(shop, token);
    console.log(`  Using product: ${productTitle} / ${variantTitle} (variant_id=${variantId}, qty=${inventoryQuantity})\n`);

    let ok = 0;
    let fail = 0;
    for (let i = 1; i <= count; i++) {
      const state = pick(ORDER_STATES);
      try {
        const order = await createOrderWithState(shop, token, variantId, state, syncWaitMs);
        ok++;
        console.log(
          `[${i}/${count}] OK   [${state.padEnd(11)}] order ${order?.name ?? `#${order?.order_number}`} id=${order?.id}`,
        );
        console.log(`         → marked paid, waited ${syncWaitMs}ms`);
      } catch (err) {
        fail++;
        console.log(`[${i}/${count}] FAIL [${state.padEnd(11)}] ${err?.message ?? err}`);
      }
    }
    console.log(`\nDone. 成功 ${ok} / 失败 ${fail}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
