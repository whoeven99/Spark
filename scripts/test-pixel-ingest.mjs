#!/usr/bin/env node
/**
 * 联调脚本：向本地 / 远端 /api/pixel-ingest 发一条测试 envelope。
 *
 * 用法：
 *   node scripts/test-pixel-ingest.mjs
 *   ENDPOINT=https://your-tunnel.example/api/pixel-ingest node scripts/test-pixel-ingest.mjs
 *   EVENT=spark:custom:test SHOP=demo.myshopify.com node scripts/test-pixel-ingest.mjs
 *
 * 成功（即使阿里云未配置）应返回 {"ok":true}。阿里云写入失败仅在 server 日志中 warn。
 */

const endpoint = process.env.ENDPOINT;
const event = process.env.EVENT;
const shopName = process.env.SHOP;
const clientId = process.env.CLIENT_ID;

const envelope = {
  ts: Date.now(),
  event,
  schemaVersion: 1,
  shopName,
  clientId,
  source: "script:test-pixel-ingest",
  payload: { hello: "world", from: "test-pixel-ingest.mjs" },
};

const body = JSON.stringify(envelope);
console.log(`POST ${endpoint}`);
console.log(body);

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});

const text = await res.text();
console.log(`status: ${res.status}`);
console.log(`body:   ${text}`);

if (!res.ok) process.exit(1);
