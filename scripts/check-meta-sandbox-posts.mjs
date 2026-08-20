/**
 * 检查 Meta 沙盒 token 能否读取主页与帖文（不输出 token）。
 * 用法：node scripts/check-meta-sandbox-posts.mjs [--env=.env.test]
 */

import { loadStackedEnv } from "./lib/loadEnv.mjs";

const GRAPH = "https://graph.facebook.com/v19.0";

function env(name) {
  return (process.env[name] || "").trim();
}

async function graphGet(accessToken, graphPath, query = {}) {
  const url = new URL(`${GRAPH}/${graphPath.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await fetch(url);
  const json = await resp.json();
  return { ok: resp.ok && !json.error, json, status: resp.status };
}

async function main() {
  loadStackedEnv();
  const token = env("META_SANDBOX_ACCESS_TOKEN");
  const adAccountId = env("META_SANDBOX_AD_ACCOUNT_ID").replace(/^act_/, "");
  const configuredPageId = env("META_SANDBOX_PAGE_ID");

  if (!token || !adAccountId) {
    console.error("缺少 META_SANDBOX_ACCESS_TOKEN 或 META_SANDBOX_AD_ACCOUNT_ID");
    process.exit(1);
  }

  const seen = new Set();
  const pages = [];
  const pushPage = (pageId, name, source) => {
    if (!pageId || seen.has(pageId)) return;
    seen.add(pageId);
    pages.push({ pageId, name: name || "(no name)", source });
  };

  console.log("=== Meta Sandbox 主页与帖文检查 ===");
  console.log(`广告账户: act_${adAccountId}`);
  console.log(`META_SANDBOX_PAGE_ID: ${configuredPageId || "(未设置)"}`);
  console.log("");

  for (const [graphPath, source] of [
    [`act_${adAccountId}/promote_pages`, "promote_pages"],
    ["me/accounts", "me/accounts"],
    ["me/pages", "me/pages"],
  ]) {
    const { ok, json } = await graphGet(token, graphPath, { fields: "id,name", limit: "50" });
    if (!ok) {
      console.log(`${source}: 失败 - ${json.error?.message || "unknown"}`);
      continue;
    }
    const rows = json.data ?? [];
    console.log(`${source}: ${rows.length} 条`);
    for (const row of rows) pushPage(String(row.id ?? "").trim(), row.name, source);
  }

  if (pages.length === 0) {
    console.log("");
    console.log("结论: 未发现任何 Facebook Page，无法获取帖文。");
    process.exit(1);
  }

  console.log("");
  console.log("可用主页:");
  for (const p of pages) {
    console.log(`- ${p.name} | ${p.pageId} | 来源: ${p.source}`);
  }

  const targetPages = configuredPageId
    ? pages.filter((p) => p.pageId === configuredPageId)
    : pages;

  if (configuredPageId && targetPages.length === 0) {
    console.log("");
    console.log(`警告: META_SANDBOX_PAGE_ID=${configuredPageId} 不在 token 可访问列表中`);
  }

  let foundAnyPost = false;
  let pageAccessToken = null;

  // 尝试拿 Page Access Token（读 published_posts 需要）
  const accountsResp = await graphGet(token, "me/accounts", {
    fields: "id,name,access_token",
    limit: "50",
  });
  if (accountsResp.ok) {
    for (const row of accountsResp.json.data ?? []) {
      const pageId = String(row.id ?? "").trim();
      const pat = String(row.access_token ?? "").trim();
      if (pageId && pat) {
        if (!pageAccessToken && (!configuredPageId || pageId === configuredPageId)) {
          pageAccessToken = pat;
        }
      }
    }
  } else {
    console.log(`me/accounts(access_token): 失败 - ${accountsResp.json.error?.message || "unknown"}`);
  }

  console.log("");
  console.log(`Page Access Token: ${pageAccessToken ? "已获取" : "未获取（可能缺少 pages_show_list）"}`);

  const promoteResp = await graphGet(token, `act_${adAccountId}/promote_pages`, {
    fields: "id,name",
    limit: "20",
  });
  console.log(
    `promote_pages (广告账户可投放主页): ${promoteResp.ok ? promoteResp.json.data?.length ?? 0 : promoteResp.json.error?.message}`,
  );
  if (promoteResp.ok) {
    for (const row of promoteResp.json.data ?? []) {
      console.log(`  - ${row.name ?? "(no name)"} | ${row.id}`);
    }
  }
  if (configuredPageId && promoteResp.ok) {
    const linked = (promoteResp.json.data ?? []).some((r) => String(r.id) === configuredPageId);
    console.log(
      linked
        ? "主页已关联到广告账户"
        : "警告: META_SANDBOX_PAGE_ID 未出现在 promote_pages，复用帖文创意可能失败",
    );
  }

  for (const page of targetPages) {
    console.log("");
    console.log(`--- 主页 ${page.pageId} (${page.name}) ---`);

    const pageToken =
      pageAccessToken &&
      (configuredPageId ? page.pageId === configuredPageId : true)
        ? pageAccessToken
        : null;

    for (const edge of ["promotable_posts", "published_posts", "feed"]) {
      const queryToken =
        edge === "promotable_posts" || edge === "published_posts" || edge === "feed"
          ? pageToken ?? token
          : token;
      const { ok, json } = await graphGet(queryToken, `${page.pageId}/${edge}`, {
        fields: "id,message,created_time,is_eligible_for_promotion",
        limit: "10",
      });
      if (!ok) {
        console.log(`${edge}: 失败 - ${json.error?.message || "unknown"}`);
        if (json.error?.code) {
          console.log(`  code: ${json.error.code} subcode: ${json.error?.error_subcode ?? "-"}`);
        }
        continue;
      }
      const posts = json.data ?? [];
      console.log(`${edge}: ${posts.length} 条`);
      for (const post of posts) {
        foundAnyPost = true;
        const msg = (post.message || "").replace(/\s+/g, " ").slice(0, 60);
        console.log(`  - ${post.id} | ${post.created_time || "-"} | ${msg || "(无文字)"}`);
        if (post.is_eligible_for_promotion === false) {
          console.log("    (不可推广)");
        }
      }
    }
  }

  console.log("");
  if (foundAnyPost) {
    console.log("结论: 可以拿到帖文，可重试「生成测试结构」。");
  } else {
    console.log("结论: 目前拿不到可用帖文。请在该主页手动发一条带链接的公开帖后再试。");
    if (!configuredPageId && pages[0]) {
      console.log(`建议设置: META_SANDBOX_PAGE_ID=${pages[0].pageId}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
