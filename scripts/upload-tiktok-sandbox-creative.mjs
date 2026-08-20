/**
 * 向 TikTok 沙盒广告素材库上传测试视频。
 * 注意：这是广告素材 video_id，不是 TT_USER 账号下的自然帖 tiktok_item_id。
 *
 * 用法（推荐本地文件，竖屏 ≥540×960）：
 *   node scripts/upload-tiktok-sandbox-creative.mjs --file ./path/to/video.mp4
 *
 * 或公网 URL（需 TikTok 服务器可拉取）：
 *   node scripts/upload-tiktok-sandbox-creative.mjs --url "https://example.com/video.mp4"
 *
 * 需要：
 *   TIKTOK_SANDBOX_ACCESS_TOKEN
 *   TIKTOK_SANDBOX_ADVERTISER_ID
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv } from "./lib/loadEnv.mjs";

const API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
const MIN_REQUEST_INTERVAL_MS = 1_500;

let requestQueue = Promise.resolve();
let lastRequestFinishedAt = 0;

function loadDotEnv() {
  loadStackedEnv();
}

function env(name) {
  return (process.env[name] || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueRequest(task) {
  const run = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestFinishedAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    try {
      return await task();
    } finally {
      lastRequestFinishedAt = Date.now();
    }
  });
  requestQueue = run.catch(() => undefined);
  return run;
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return "";
  return (process.argv[index + 1] || "").trim();
}

async function uploadByFile({ accessToken, advertiserId, filePath }) {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`文件不存在: ${resolved}`);
  }
  const buffer = readFileSync(resolved);
  const signature = createHash("md5").update(buffer).digest("hex");
  const fileName = path.basename(resolved);

  return enqueueRequest(async () => {
    const form = new FormData();
    form.append("advertiser_id", advertiserId);
    form.append("upload_type", "UPLOAD_BY_FILE");
    form.append("video_signature", signature);
    form.append("file_name", fileName);
    form.append("video_file", new Blob([buffer]), fileName);

    const response = await fetch(`${API_BASE}/file/video/ad/upload/`, {
      method: "POST",
      headers: { "Access-Token": accessToken },
      body: form,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return json;
  });
}

async function uploadByUrl({ accessToken, advertiserId, videoUrl }) {
  return enqueueRequest(async () => {
    const response = await fetch(`${API_BASE}/file/video/ad/upload/`, {
      method: "POST",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        upload_type: "UPLOAD_BY_URL",
        video_url: videoUrl,
        file_name: `spark-sandbox-${Date.now().toString(36)}.mp4`,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return json;
  });
}

async function main() {
  loadDotEnv();
  const accessToken = env("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = env("TIKTOK_SANDBOX_ADVERTISER_ID");
  const filePath =
    readArg("--file") || env("TIKTOK_SANDBOX_SEED_VIDEO_FILE");
  const videoUrl =
    readArg("--url") || env("TIKTOK_SANDBOX_SEED_VIDEO_URL");

  if (!accessToken || !advertiserId) {
    console.error("缺少 TIKTOK_SANDBOX_ACCESS_TOKEN 或 TIKTOK_SANDBOX_ADVERTISER_ID");
    process.exit(1);
  }
  if (!filePath && !videoUrl) {
    console.error("请提供 --file <本地mp4> 或 --url <公网mp4>");
    process.exit(1);
  }

  console.log("advertiser_id:", advertiserId);

  const json = filePath
    ? await uploadByFile({ accessToken, advertiserId, filePath })
    : await uploadByUrl({ accessToken, advertiserId, videoUrl });

  const row = Array.isArray(json.data) ? json.data[0] : json.data;
  const videoId = row?.video_id ? String(row.video_id).trim() : "";
  if (!videoId) {
    console.error("上传成功但未返回 video_id");
    process.exit(1);
  }

  console.log("video_id:", videoId);
  console.log("\n写入 .env 后可配合 seed 使用：");
  if (filePath) {
    console.log(`TIKTOK_SANDBOX_SEED_VIDEO_FILE=${path.resolve(filePath)}`);
  } else {
    console.log(`TIKTOK_SANDBOX_SEED_VIDEO_URL=${videoUrl}`);
  }
  console.log(
    "\n说明：这是广告素材库 video_id，不会出现在 identity/video/get 的自然帖列表。",
  );
  console.log("若需 Spark Ad（tiktok_item_id），仍需在绑定的 TikTok 账号手动发布视频。");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
