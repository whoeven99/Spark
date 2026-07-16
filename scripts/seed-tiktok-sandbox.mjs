/**
 * CLI：向 TikTok 沙盒创建最小 Campaign → AdGroup → Image Ad + Video Ad，并列出当前系列。
 *
 * 用法（凭证只从环境 / .env 读取，勿把 token 写进命令行）：
 *   node scripts/seed-tiktok-sandbox.mjs
 *
 * 需要：
 *   TIKTOK_SANDBOX_ACCESS_TOKEN
 *   TIKTOK_SANDBOX_ADVERTISER_ID
 *   可选 TIKTOK_SANDBOX_ACCOUNT_NAME
 *   可选 TIKTOK_SANDBOX_IMAGE_ID
 *   可选 TIKTOK_SANDBOX_VIDEO_URL（占位视频公网 URL；未设则用内置样例）
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** seed 的 ad/create 固定走 v1.2 */
const AD_CREATE_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.2";
const DEFAULT_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";
const DEFAULT_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4";

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
  const apiBase = params.apiBase || API_BASE;
  const url = new URL(`${apiBase}${params.path}`);
  for (const [key, value] of Object.entries(params.query || {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    method: params.method || (params.body ? "POST" : "GET"),
    headers: {
      "Access-Token": params.accessToken,
      ...(params.body ? { "Content-Type": "application/json" } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message || `HTTP ${response.status}`);
  }
  return json;
}

function formatScheduleStart() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

async function uploadPlaceholderVideo({ accessToken, advertiserId, fileName }) {
  const videoUrl = env("TIKTOK_SANDBOX_VIDEO_URL") || DEFAULT_VIDEO_URL;
  console.log("Uploading placeholder video via URL…");
  const json = await tiktokRequest({
    method: "POST",
    path: "/file/video/ad/upload/",
    accessToken,
    body: {
      advertiser_id: advertiserId,
      upload_type: "UPLOAD_BY_URL",
      file_name: fileName.slice(0, 100),
      video_url: videoUrl,
    },
  });
  const videoId = String(json.data?.video_id || json.data?.id || "").trim();
  if (!videoId) throw new Error("file/video/ad/upload missing video_id");
  return videoId;
}

async function createAd({ accessToken, body, warnings, label }) {
  try {
    console.log(`Creating ad (v1.2) ${label}…`);
    const adJson = await tiktokRequest({
      method: "POST",
      path: "/ad/create/",
      accessToken,
      apiBase: AD_CREATE_API_BASE,
      body,
    });
    const adId = String(adJson.data?.ad_ids?.[0] || adJson.data?.creatives?.[0]?.ad_id || "").trim();
    console.log(`${label} ad_id:`, adId || "(empty)");
    if (adId) return adId;
    warnings.push(`ad/create(v1.2) ${label} missing ad_id`);
  } catch (e) {
    warnings.push(`ad/create(v1.2) ${label} failed: ${e.message || e}`);
    console.warn(warnings[warnings.length - 1]);
  }
  return "";
}

async function main() {
  loadDotEnv();
  const accessToken = env("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = env("TIKTOK_SANDBOX_ADVERTISER_ID");
  const accountName = env("TIKTOK_SANDBOX_ACCOUNT_NAME") || "Spark Sandbox";
  const imageId = env("TIKTOK_SANDBOX_IMAGE_ID") || DEFAULT_IMAGE_ID;
  if (!accessToken || !advertiserId) {
    console.error("Missing TIKTOK_SANDBOX_ACCESS_TOKEN and/or TIKTOK_SANDBOX_ADVERTISER_ID");
    process.exit(1);
  }

  console.log("Advertiser:", advertiserId);
  if (accountName) console.log("Account name:", accountName);

  const stamp = Date.now().toString(36);
  const campaignName = `Spark Sandbox Campaign ${stamp}`;
  const adgroupName = `Spark Sandbox AdGroup ${stamp}`;
  const imageAdName = `Spark Sandbox Image Ad ${stamp}`;
  const videoAdName = `Spark Sandbox Video Ad ${stamp}`;
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
      },
    });
    adgroupId = String(adgroupJson.data?.adgroup_id || "").trim();
    console.log("adgroup_id:", adgroupId || "(empty)");
    if (!adgroupId) warnings.push("adgroup/create missing adgroup_id");
  } catch (e) {
    warnings.push(`adgroup/create failed: ${e.message || e}`);
    console.warn(warnings[warnings.length - 1]);
  }

  let imageAdId = "";
  let videoAdId = "";
  let videoId = "";

  if (adgroupId) {
    imageAdId = await createAd({
      accessToken,
      warnings,
      label: "SINGLE_IMAGE",
      body: {
        advertiser_id: advertiserId,
        adgroup_id: adgroupId,
        creatives: [
          {
            ad_name: imageAdName,
            ad_format: "SINGLE_IMAGE",
            ad_text: "Spark sandbox test image ad",
            call_to_action: "LEARN_MORE",
            landing_page_url: "https://www.example.com",
            display_name: accountName,
            image_ids: [imageId],
          },
        ],
      },
    });

    try {
      videoId = await uploadPlaceholderVideo({
        accessToken,
        advertiserId,
        fileName: `spark-sandbox-video-${stamp}.mp4`,
      });
      console.log("video_id:", videoId);
    } catch (e) {
      warnings.push(`video upload failed: ${e.message || e}`);
      console.warn(warnings[warnings.length - 1]);
    }

    if (videoId) {
      videoAdId = await createAd({
        accessToken,
        warnings,
        label: "SINGLE_VIDEO",
        body: {
          advertiser_id: advertiserId,
          adgroup_id: adgroupId,
          creatives: [
            {
              ad_name: videoAdName,
              ad_format: "SINGLE_VIDEO",
              ad_text: "Spark sandbox test video ad",
              call_to_action: "LEARN_MORE",
              landing_page_url: "https://www.example.com",
              display_name: accountName,
              video_id: videoId,
              image_ids: [imageId],
            },
          ],
        },
      });
    }
  }

  console.log("\nSeed result:");
  console.log(
    JSON.stringify(
      {
        campaignId,
        adgroupId: adgroupId || null,
        imageAdId: imageAdId || null,
        videoAdId: videoAdId || null,
        videoId: videoId || null,
        campaignName,
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
