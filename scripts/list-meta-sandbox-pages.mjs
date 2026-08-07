/**
 * 列举 Meta 沙盒 token 可发现的 Facebook Page。
 * 用法：node scripts/list-meta-sandbox-pages.mjs
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

async function graphGet(accessToken, path, query = {}) {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${resp.status}`);
  }
  return json;
}

async function main() {
  loadDotEnv();
  const accessToken = env("META_SANDBOX_ACCESS_TOKEN");
  const adAccountId = env("META_SANDBOX_AD_ACCOUNT_ID").replace(/^act_/, "");
  if (!accessToken || !adAccountId) {
    console.error("缺少 META_SANDBOX_ACCESS_TOKEN 或 META_SANDBOX_AD_ACCOUNT_ID");
    process.exit(1);
  }

  const seen = new Set();
  const pages = [];

  const pushRows = (rows) => {
    for (const row of rows ?? []) {
      const pageId = String(row.id ?? "").trim();
      if (!pageId || seen.has(pageId)) continue;
      seen.add(pageId);
      pages.push({ pageId, name: row.name });
    }
  };

  try {
    const promote = await graphGet(accessToken, `act_${adAccountId}/promote_pages`, {
      fields: "id,name",
      limit: "50",
    });
    pushRows(promote.data);
    console.log("act_* /promote_pages:", promote.data?.length ?? 0, "条");
  } catch (e) {
    console.warn("promote_pages 失败:", e.message);
  }

  try {
    const accounts = await graphGet(accessToken, "me/accounts", {
      fields: "id,name",
      limit: "50",
    });
    pushRows(accounts.data);
    console.log("me/accounts:", accounts.data?.length ?? 0, "条");
  } catch (e) {
    console.warn("me/accounts 失败:", e.message);
  }

  try {
    const mePages = await graphGet(accessToken, "me/pages", {
      fields: "id,name",
      limit: "50",
    });
    pushRows(mePages.data);
    console.log("me/pages:", mePages.data?.length ?? 0, "条");
  } catch (e) {
    console.warn("me/pages 失败:", e.message);
  }

  if (pages.length === 0) {
    console.log("");
    console.log("未找到任何 Page。请：");
    console.log("1. 在 https://www.facebook.com/pages/create 创建主页");
    console.log("2. 在 Business Manager 将 Page 分配给沙盒广告账户");
    console.log("3. 将 Page ID 写入 .env：META_SANDBOX_PAGE_ID=<数字ID>");
    process.exit(1);
  }

  console.log("");
  console.log("可用 Facebook Page：");
  for (const page of pages) {
    console.log(`- ${page.name ?? "(no name)"} · ${page.pageId}`);
  }
  console.log("");
  console.log(`推荐写入 .env：META_SANDBOX_PAGE_ID=${pages[0].pageId}`);
  console.log("");
  console.log("若「生成测试结构」报开发模式帖文错误，请先在主页发一条帖文，或设置 META_SANDBOX_SEED_OBJECT_STORY_ID=<pageId_postId>");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
