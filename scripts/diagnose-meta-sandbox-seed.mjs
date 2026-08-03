/**
 * 诊断 Meta 沙盒 promotable_posts / 发帖 / 创意创建。
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
  const init = { method };
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

async function main() {
  loadDotEnv();
  const userToken = env("META_SANDBOX_ACCESS_TOKEN");
  const adAccountId = env("META_SANDBOX_AD_ACCOUNT_ID").replace(/^act_/, "");
  const pageId = env("META_SANDBOX_PAGE_ID");
  if (!userToken || !adAccountId || !pageId) {
    console.error("需要 META_SANDBOX_ACCESS_TOKEN / AD_ACCOUNT_ID / PAGE_ID");
    process.exit(1);
  }

  const accounts = await graph("GET", "me/accounts", userToken, {
    fields: "id,name,access_token,tasks",
    limit: "10",
  });
  const pageRow = accounts.json.data?.find((r) => r.id === pageId);
  const pageToken = pageRow?.access_token?.trim();
  console.log("page tasks:", pageRow?.tasks ?? "(none)");
  console.log("page token:", pageToken ? "yes" : "no");

  for (const [edge, tokenLabel, token] of [
    ["promotable_posts", "user", userToken],
    ["promotable_posts", "page", pageToken],
    ["ads_posts", "page", pageToken],
    ["published_posts", "page", pageToken],
  ]) {
    if (!token) continue;
    const { ok, json } = await graph("GET", `${pageId}/${edge}`, token, {
      fields: "id,is_eligible_for_promotion,message",
      limit: "5",
    });
    console.log(`\n${edge} (${tokenLabel}):`, ok ? `${json.data?.length ?? 0} rows` : json.error?.message);
    for (const row of json.data ?? []) {
      console.log(" ", row.id, row.is_eligible_for_promotion, (row.message || "").slice(0, 40));
    }
  }

  if (pageToken) {
    console.log("\n--- try page feed post (text only) ---");
    const textPost = await graph("POST", `${pageId}/feed`, pageToken, {
      message: `Spark sandbox diag ${Date.now()}`,
      published: "true",
    });
    console.log("text feed:", textPost.ok ? textPost.json.id : textPost.json.error?.message);

    console.log("\n--- try page feed post (link) ---");
    const linkPost = await graph("POST", `${pageId}/feed`, pageToken, {
      message: "Spark sandbox link test",
      link: "https://example.com",
      published: "true",
    });
    console.log("link feed:", linkPost.ok ? linkPost.json.id : linkPost.json.error?.message);

    const storyId = linkPost.ok
      ? `${pageId}_${linkPost.json.id}`
      : textPost.ok
        ? `${pageId}_${textPost.json.id}`
        : null;

    if (storyId) {
      console.log("\n--- try ad creative with object_story_id ---", storyId);
      const creative = await graph("POST", `act_${adAccountId}/adcreatives`, userToken, {
        name: "diag creative",
        object_story_id: storyId,
      });
      console.log(
        "creative:",
        creative.ok ? creative.json.id : creative.json.error?.error_user_msg || creative.json.error?.message,
      );
    }
  }

  console.log("\n--- catalogs ---");
  for (const p of [
    `act_${adAccountId}/product_catalogs`,
    "me/businesses",
  ]) {
    const { ok, json } = await graph("GET", p, userToken, { fields: "id,name", limit: "5" });
    console.log(p, ok ? (json.data?.length ?? 0) : json.error?.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
