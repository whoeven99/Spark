/**
 * CLI：向 TikTok 沙盒创建 Campaign → AdGroup（v1.3，需 identity）→ Ad（v1.2 workaround）。
 * Insights 指标由应用侧 mock，不依赖沙盒报表。
 *
 * 用法：
 *   node scripts/seed-tiktok-sandbox.mjs
 *
 * 需要：
 *   TIKTOK_SANDBOX_ACCESS_TOKEN
 *   TIKTOK_SANDBOX_ADVERTISER_ID
 *   TIKTOK_SANDBOX_IDENTITY_ID
 *   TIKTOK_SANDBOX_IDENTITY_TYPE
 *   可选 TIKTOK_SANDBOX_ACCOUNT_NAME、TIKTOK_SANDBOX_IMAGE_ID
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
const API_BASE_V12 = "https://sandbox-ads.tiktok.com/open_api/v1.2";
const DEFAULT_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";
const MIN_REQUEST_INTERVAL_MS = 1_100;
const QPS_MAX_RETRIES = 4;

let requestChain = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQpsLimitMessage(message) {
  return /qps\s*limit/i.test(message);
}

async function waitForRateSlot() {
  const run = async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
  };
  const next = requestChain.then(run, run);
  requestChain = next.catch(() => undefined);
  await next;
}

function loadDotEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function env(name) {
  return (process.env[name] || "").trim();
}

async function tiktokRequest(params) {
  const url = new URL(`${params.apiBase || API_BASE}${params.path}`);
  for (const [key, value] of Object.entries(params.query || {})) {
    url.searchParams.set(key, value);
  }
  const method = params.method || (params.body ? "POST" : "GET");

  for (let attempt = 0; attempt <= QPS_MAX_RETRIES; attempt++) {
    await waitForRateSlot();
    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Access-Token": params.accessToken,
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      const detail = json.message || `HTTP ${response.status}`;
      if (isQpsLimitMessage(detail) && attempt < QPS_MAX_RETRIES) {
        const backoffMs = MIN_REQUEST_INTERVAL_MS * (attempt + 1);
        console.warn(`QPS limit on ${params.path}, retry ${attempt + 1}/${QPS_MAX_RETRIES} after ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      throw new Error(detail);
    }
    return json;
  }

  throw new Error(`QPS limit retries exhausted for ${params.path}`);
}

function formatScheduleStart() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

function buildAdCreativeV12({ adName, imageId, identityId, identityType, displayName }) {
  const creative = {
    ad_name: adName,
    ad_format: "SINGLE_IMAGE",
    identity_id: identityId,
    identity_type: identityType,
    image_ids: [imageId],
    ad_text: "Spark sandbox test",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://example.com",
  };
  if (identityType === "CUSTOMIZED_USER" && displayName) {
    creative.display_name = displayName;
  }
  return creative;
}

function extractAdId(data) {
  if (!data) return "";
  if (Array.isArray(data.ad_ids) && data.ad_ids.length > 0) {
    return String(data.ad_ids[0]).trim();
  }
  if (Array.isArray(data.creatives) && data.creatives.length > 0) {
    const id = data.creatives[0].ad_id;
    if (id !== undefined) return String(id).trim();
  }
  return "";
}

async function main() {
  loadDotEnv();
  const accessToken = env("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = env("TIKTOK_SANDBOX_ADVERTISER_ID");
  const identityId = env("TIKTOK_SANDBOX_IDENTITY_ID");
  const identityType = env("TIKTOK_SANDBOX_IDENTITY_TYPE");
  const accountName = env("TIKTOK_SANDBOX_ACCOUNT_NAME") || "Spark Sandbox";
  const imageId = env("TIKTOK_SANDBOX_IMAGE_ID") || DEFAULT_IMAGE_ID;

  if (!accessToken || !advertiserId) {
    console.error("Missing TIKTOK_SANDBOX_ACCESS_TOKEN and/or TIKTOK_SANDBOX_ADVERTISER_ID");
    process.exit(1);
  }
  if (!identityId || !identityType) {
    console.error("Missing TIKTOK_SANDBOX_IDENTITY_ID and/or TIKTOK_SANDBOX_IDENTITY_TYPE");
    process.exit(1);
  }

  console.log("Advertiser:", advertiserId);
  console.log("Identity:", identityId, identityType);
  if (accountName) console.log("Account name:", accountName);

  const stamp = Date.now().toString(36);
  const campaignName = `Spark Sandbox Campaign ${stamp}`;
  const adgroupName = `Spark Sandbox AdGroup ${stamp}`;
  const adName = `Spark Sandbox Ad ${stamp}`;
  const warnings = [];

  console.log("\nCreating campaign…");
  const campaignJson = await tiktokRequest({
    method: "POST",
    path: "/campaign/create/",
    accessToken,
    body: {
      advertiser_id: advertiserId,
      campaign_name: campaignName,
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_DAY",
      budget: 50,
      operation_status: "DISABLE",
    },
  });
  const campaignId = String(campaignJson.data?.campaign_id || "").trim();
  if (!campaignId) throw new Error("campaign/create missing campaign_id");
  console.log("campaign_id:", campaignId);

  let adgroupId = "";
  try {
    console.log("Creating adgroup…");
    const adgroupJson = await tiktokRequest({
      method: "POST",
      path: "/adgroup/create/",
      accessToken,
      body: {
        advertiser_id: advertiserId,
        campaign_id: campaignId,
        adgroup_name: adgroupName,
        promotion_type: "WEBSITE",
        placement_type: "PLACEMENT_TYPE_NORMAL",
        placements: ["PLACEMENT_TIKTOK"],
        location_ids: ["6252001"],
        budget_mode: "BUDGET_MODE_DAY",
        budget: 20,
        schedule_type: "SCHEDULE_FROM_NOW",
        schedule_start_time: formatScheduleStart(),
        optimization_goal: "CLICK",
        billing_event: "CPC",
        bid_type: "BID_TYPE_NO_BID",
        pacing: "PACING_MODE_SMOOTH",
        operation_status: "DISABLE",
        identity_id: identityId,
        identity_type: identityType,
      },
    });
    adgroupId = String(adgroupJson.data?.adgroup_id || "").trim();
    console.log("adgroup_id:", adgroupId || "(empty)");
    if (!adgroupId) warnings.push("adgroup/create missing adgroup_id");
  } catch (e) {
    warnings.push(`adgroup/create failed: ${e.message || e}`);
    console.warn(warnings[warnings.length - 1]);
  }

  let adId = "";
  if (adgroupId) {
    try {
      console.log("Creating ad (v1.2)…");
      const adJson = await tiktokRequest({
        method: "POST",
        path: "/ad/create/",
        accessToken,
        apiBase: API_BASE_V12,
        body: {
          advertiser_id: advertiserId,
          adgroup_id: adgroupId,
          creatives: [
            buildAdCreativeV12({
              adName,
              imageId,
              identityId,
              identityType,
              displayName: accountName,
            }),
          ],
        },
      });
      adId = extractAdId(adJson.data);
      console.log("ad_id:", adId || "(empty)");
      if (!adId) warnings.push("ad/create missing ad_id");
    } catch (e) {
      warnings.push(`ad/create failed: ${e.message || e}`);
      console.warn(warnings[warnings.length - 1]);
    }
  }

  console.log("\nSeed result:");
  console.log(
    JSON.stringify(
      {
        campaignId,
        adgroupId: adgroupId || null,
        adId: adId || null,
        campaignName,
        adName,
        warnings,
      },
      null,
      2,
    ),
  );

  console.log("\nListing campaigns…");
  const campaigns = await tiktokRequest({
    path: "/campaign/get/",
    accessToken,
    query: {
      advertiser_id: advertiserId,
      page: "1",
      page_size: "20",
      fields: JSON.stringify(["campaign_id", "campaign_name", "operation_status"]),
    },
  });
  const list = campaigns.data?.list || [];
  console.log(`campaign count: ${list.length}`);
  for (const row of list.slice(0, 10)) {
    console.log(`- ${row.campaign_name} (${row.campaign_id}) [${row.operation_status}]`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
