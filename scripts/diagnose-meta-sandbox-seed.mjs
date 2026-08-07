/**
 * Meta 沙盒 seed 一站式诊断：主页关联、帖文、发帖权限、创意创建、Catalog。
 * 用法：node scripts/diagnose-meta-sandbox-seed.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRAPH = "https://graph.facebook.com/v19.0";

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

async function graph(method, graphPath, token, body) {
  const url = `${GRAPH}/${graphPath.replace(/^\//, "")}`;
  if (method === "GET") {
    const u = new URL(url);
    u.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(body ?? {})) u.searchParams.set(k, v);
    const resp = await fetch(u);
    const json = await resp.json();
    return { ok: resp.ok && !json.error, json };
  }
  const params = new URLSearchParams();
  params.set("access_token", token);
  for (const [k, v] of Object.entries(body ?? {})) {
    params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await resp.json();
  return { ok: resp.ok && !json.error, json };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  loadDotEnv();
  const userToken = env("META_SANDBOX_ACCESS_TOKEN");
  const adAccountId = env("META_SANDBOX_AD_ACCOUNT_ID").replace(/^act_/, "");
  const pageId = env("META_SANDBOX_PAGE_ID");
  const configuredStoryId = env("META_SANDBOX_SEED_OBJECT_STORY_ID");

  if (!userToken || !adAccountId) {
    console.error("需要 META_SANDBOX_ACCESS_TOKEN 与 META_SANDBOX_AD_ACCOUNT_ID");
    process.exit(1);
  }

  console.log("Meta 沙盒 seed 一站式诊断");
  console.log(`广告账户: act_${adAccountId}`);
  console.log(`META_SANDBOX_PAGE_ID: ${pageId || "(未设置，将自动发现)"}`);

  const blockers = [];
  const hints = [];
  let resolvedPageId = pageId;
  let pageToken = null;
  let pageTasks = [];

  // --- 1. 发现主页 ---
  section("1. 主页发现");
  const promotePagesResp = await graph("GET", `act_${adAccountId}/promote_pages`, userToken, {
    fields: "id,name",
    limit: "20",
  });
  const promotePages = promotePagesResp.ok ? promotePagesResp.json.data ?? [] : [];
  console.log(`promote_pages: ${promotePages.length} 条`);
  for (const row of promotePages) {
    console.log(`  - ${row.name ?? "(no name)"} | ${row.id}`);
  }
  if (promotePages.length === 0) {
    blockers.push("主页未关联到广告账户（promote_pages 为空）");
    hints.push("在 Business Manager → Ad accounts → 该账户 → Pages 添加主页");
  }

  const accountsResp = await graph("GET", "me/accounts", userToken, {
    fields: "id,name,access_token,tasks",
    limit: "20",
  });
  const accountPages = accountsResp.ok ? accountsResp.json.data ?? [] : [];
  console.log(`me/accounts: ${accountPages.length} 条`);
  for (const row of accountPages) {
    console.log(`  - ${row.name ?? "(no name)"} | ${row.id} | tasks: ${(row.tasks ?? []).join(", ") || "-"}`);
  }

  if (!resolvedPageId && promotePages[0]?.id) {
    resolvedPageId = promotePages[0].id;
    hints.push(`建议设置 META_SANDBOX_PAGE_ID=${resolvedPageId}`);
  }
  if (!resolvedPageId && accountPages[0]?.id) {
    resolvedPageId = accountPages[0].id;
    hints.push(`建议设置 META_SANDBOX_PAGE_ID=${resolvedPageId}`);
  }
  if (!resolvedPageId) {
    console.error("\n无法发现 Facebook Page，请先创建主页或设置 META_SANDBOX_PAGE_ID");
    process.exit(1);
  }

  const pageRow = accountPages.find((r) => r.id === resolvedPageId);
  pageToken = pageRow?.access_token?.trim() || null;
  pageTasks = pageRow?.tasks ?? [];
  const pageLinked = promotePages.some((r) => r.id === resolvedPageId);
  console.log(`\n选用主页: ${resolvedPageId}`);
  console.log(`已关联 promote_pages: ${pageLinked ? "是" : "否"}`);
  console.log(`page tasks: ${pageTasks.length ? pageTasks.join(", ") : "(none)"}`);
  console.log(`page token: ${pageToken ? "已获取" : "未获取"}`);

  if (!pageLinked) {
    blockers.push(`主页 ${resolvedPageId} 不在 promote_pages 中`);
  }
  const canPost =
    pageTasks.includes("MANAGE") ||
    pageTasks.includes("CREATE_CONTENT") ||
    pageTasks.includes("MODERATE");
  if (!canPost) {
    blockers.push("Page Token 仅 ADVERTISE，无法 API 发帖");
    hints.push("在 BM 授予主页 Admin 或 CREATE_CONTENT 权限，或手动在主页发带链接帖");
  }

  // --- 2. 尝试自动关联 ---
  if (!pageLinked) {
    section("2. 尝试 assigned_pages 自动关联");
    const assign = await graph("POST", `act_${adAccountId}/assigned_pages`, userToken, {
      page_id: resolvedPageId,
    });
    if (assign.ok) {
      console.log("assigned_pages: 成功");
      const recheck = await graph("GET", `act_${adAccountId}/promote_pages`, userToken, {
        fields: "id",
        limit: "20",
      });
      const nowLinked = (recheck.json.data ?? []).some((r) => r.id === resolvedPageId);
      console.log(`关联后 promote_pages 可见: ${nowLinked ? "是" : "否"}`);
      if (nowLinked) {
        const idx = blockers.findIndex((b) => b.includes("promote_pages"));
        if (idx >= 0) blockers.splice(idx, 1);
      }
    } else {
      console.log("assigned_pages: 失败 -", assign.json.error?.message);
      hints.push("手动在 BM 将 Page 分配给广告账户");
    }
  }

  // --- 3. 帖文枚举（结合 published_posts 的 is_eligible_for_promotion）---
  section("3. 帖文来源");
  const candidatePosts = [];
  const seen = new Set();

  for (const [edge, token, label] of [
    ["promotable_posts", pageToken ?? userToken, "page/user"],
    ["ads_posts", pageToken ?? userToken, "page"],
    ["published_posts", pageToken ?? userToken, "page"],
    ["feed", pageToken ?? userToken, "page"],
  ]) {
    if (!token) continue;
    const { ok, json } = await graph("GET", `${resolvedPageId}/${edge}`, token, {
      fields: "id,is_eligible_for_promotion,message",
      limit: "10",
    });
    if (!ok) {
      console.log(`${edge} (${label}): 失败 - ${json.error?.message}`);
      continue;
    }
    const rows = json.data ?? [];
    console.log(`${edge} (${label}): ${rows.length} 条`);
    for (const row of rows) {
      const storyId = row.id?.includes("_") ? row.id : `${resolvedPageId}_${row.id}`;
      if (!storyId || seen.has(storyId)) continue;
      seen.add(storyId);
      const eligible = row.is_eligible_for_promotion;
      console.log(
        `  - ${storyId} | eligible=${eligible ?? "?"} | ${(row.message || "").slice(0, 36)}`,
      );
      candidatePosts.push({ storyId, eligible, edge });
    }
  }

  const eligiblePosts = candidatePosts.filter((p) => p.eligible !== false);
  if (eligiblePosts.length === 0 && candidatePosts.length > 0) {
    blockers.push("有帖文但 is_eligible_for_promotion 均为 false");
  }
  if (candidatePosts.length === 0) {
    blockers.push("主页上无可用帖文");
    hints.push("在 Facebook 主页手动发一条带链接的公开帖");
  }

  // --- 4. 结合：对已有帖 + 配置的 storyId 逐个试创建创意 ---
  section("4. 创意创建探测（object_story_id）");
  const storyIdsToTry = [];
  if (configuredStoryId) {
    const normalized = configuredStoryId.includes("_")
      ? configuredStoryId
      : `${resolvedPageId}_${configuredStoryId}`;
    storyIdsToTry.push({ storyId: normalized, source: "env META_SANDBOX_SEED_OBJECT_STORY_ID" });
  }
  for (const post of eligiblePosts.slice(0, 5)) {
    if (!storyIdsToTry.some((s) => s.storyId === post.storyId)) {
      storyIdsToTry.push({ storyId: post.storyId, source: `published (${post.edge})` });
    }
  }

  let workingStoryId = null;
  for (const { storyId, source } of storyIdsToTry) {
    const creative = await graph("POST", `act_${adAccountId}/adcreatives`, userToken, {
      name: `spark-diag-${Date.now()}`,
      object_story_id: storyId,
    });
    if (creative.ok) {
      console.log(`✓ ${storyId} (${source}) → creative ${creative.json.id}`);
      workingStoryId = storyId;
      break;
    }
    const err =
      creative.json.error?.error_user_msg ||
      creative.json.error?.message ||
      "unknown";
    console.log(`✗ ${storyId} (${source}) → ${err}`);
  }

  if (!workingStoryId && storyIdsToTry.length > 0) {
    blockers.push("已有帖文均无法创建广告创意");
    if (!pageLinked) {
      hints.push("优先修复 promote_pages 关联后再重试");
    }
    hints.push(`可手动发帖后设置 META_SANDBOX_SEED_OBJECT_STORY_ID=${resolvedPageId}_<postId>`);
  }

  // --- 5. API 发帖（仅当无可用创意时探测）---
  if (!workingStoryId && pageToken) {
    section("5. API 发帖探测");
    const linkPost = await graph("POST", `${resolvedPageId}/feed`, pageToken, {
      message: "Spark sandbox link test",
      link: "https://example.com",
      published: "true",
    });
    if (linkPost.ok) {
      const newStoryId = `${resolvedPageId}_${linkPost.json.id}`;
      console.log(`link feed: 成功 → ${newStoryId}`);
      const creative = await graph("POST", `act_${adAccountId}/adcreatives`, userToken, {
        name: "spark-diag-new-post",
        object_story_id: newStoryId,
      });
      if (creative.ok) {
        console.log(`✓ 新帖创意成功 → ${creative.json.id}`);
        workingStoryId = newStoryId;
      } else {
        console.log(
          "✗ 新帖创意失败:",
          creative.json.error?.error_user_msg || creative.json.error?.message,
        );
      }
    } else {
      console.log("link feed: 失败 -", linkPost.json.error?.message);
    }
  }

  // --- 6. Catalog / 其他策略 ---
  section("6. Catalog（catalog_dpa 策略）");
  for (const p of [`act_${adAccountId}/product_catalogs`, "me/businesses"]) {
    const { ok, json } = await graph("GET", p, userToken, { fields: "id,name", limit: "3" });
    console.log(p, ok ? `${json.data?.length ?? 0} 条` : json.error?.message);
  }
  const envCatalog = env("META_SANDBOX_PRODUCT_CATALOG_ID");
  if (envCatalog) console.log(`META_SANDBOX_PRODUCT_CATALOG_ID: ${envCatalog}`);

  // --- 结论 ---
  section("结论与建议");
  if (workingStoryId) {
    console.log("✓ seed 可走 traffic_existing_post 策略");
    console.log("\n建议写入 .env：");
    console.log(`META_SANDBOX_PAGE_ID=${resolvedPageId}`);
    console.log(`META_SANDBOX_SEED_OBJECT_STORY_ID=${workingStoryId}`);
    console.log("META_SANDBOX_SEED_LINK_URL=https://example.com");
    console.log("\n然后重启 dev server，点击「生成测试结构」。");
    return;
  }

  console.log("✗ 当前无法完成 seed，需先处理以下阻塞项：");
  for (const b of blockers) console.log(`  - ${b}`);
  if (hints.length > 0) {
    console.log("\n建议操作：");
    for (const h of [...new Set(hints)]) console.log(`  - ${h}`);
  }
  console.log("\n最小修复路径（按顺序）：");
  console.log("  1. BM 将 Page 关联到广告账户 act_" + adAccountId);
  console.log("  2. 在主页手动发一条带 https://example.com 的公开帖");
  console.log("  3. 将帖文 ID 写入 META_SANDBOX_SEED_OBJECT_STORY_ID");
  console.log("  4. 重跑本脚本确认「创意创建探测」出现 ✓");
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
