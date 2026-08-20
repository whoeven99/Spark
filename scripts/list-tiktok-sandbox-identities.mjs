/**
 * 列出沙盒广告主下所有 identity（identity_id + identity_type）。
 * 用法：node scripts/list-tiktok-sandbox-identities.mjs [identity_id] [--env=.env.test]
 */

import { loadStackedEnv } from "./lib/loadEnv.mjs";

const targetId = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";
const API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";

function env(name) {
  return (process.env[name] || "").trim();
}

async function main() {
  loadStackedEnv();
  const accessToken = env("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = env("TIKTOK_SANDBOX_ADVERTISER_ID");
  if (!accessToken || !advertiserId) {
    console.error("缺少 TIKTOK_SANDBOX_ACCESS_TOKEN 或 TIKTOK_SANDBOX_ADVERTISER_ID");
    process.exit(1);
  }

  const all = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${API_BASE}/identity/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "50");

    const res = await fetch(url, { headers: { "Access-Token": accessToken } });
    const json = await res.json().catch(() => ({}));
    if (json.code !== 0) {
      console.error(
        JSON.stringify(
          { code: json.code, message: json.message, request_id: json.request_id },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const list = json.data?.identity_list || json.data?.list || [];
    all.push(...list);
    const totalPage = json.data?.page_info?.total_page || 1;
    if (page >= totalPage || list.length === 0) break;
  }

  console.log(`advertiser_id: ${advertiserId}`);
  console.log(`total identities: ${all.length}\n`);

  for (const item of all) {
    console.log(
      JSON.stringify({
        identity_id: item.identity_id,
        identity_type: item.identity_type,
        display_name: item.display_name,
        available_status: item.available_status,
      }),
    );
  }

  if (targetId) {
    const hit = all.find((x) => String(x.identity_id) === targetId);
    console.log(`\n--- lookup ${targetId} ---`);
    if (hit) {
      console.log(JSON.stringify(hit, null, 2));
      console.log(`\n建议写入 .env：`);
      console.log(`TIKTOK_SANDBOX_IDENTITY_ID=${hit.identity_id}`);
      console.log(`TIKTOK_SANDBOX_IDENTITY_TYPE=${hit.identity_type}`);
    } else {
      console.log("NOT FOUND：该 identity_id 不属于当前沙盒广告主");
    }
  } else if (all.length > 0) {
    const first = all[0];
    console.log(`\n示例 .env 配置（取列表第一条）：`);
    console.log(`TIKTOK_SANDBOX_IDENTITY_ID=${first.identity_id}`);
    console.log(`TIKTOK_SANDBOX_IDENTITY_TYPE=${first.identity_type}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
