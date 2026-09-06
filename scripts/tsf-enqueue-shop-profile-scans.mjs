/**
 * 批量入队 TSF 店铺画像扫描（只写 Cosmos job + Redis hint，不查 Shopify）。
 *
 * Worker 才会：读 Session.accessToken → 拉 Shopify → 写 ShopProfile / Blob。
 *
 * 默认 dry-run。生产写入需二次确认：
 *   node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod
 *   node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod --confirm-prod
 *   node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod --confirm-prod --limit=20
 *   node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod --confirm-prod --offset=10 --limit=20
 *   node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod --confirm-prod --delay-ms=200
 *
 * 范围：TSF Turso 上有 offline Session + 非空 accessToken 的全部店（刷新画像）。
 * 跳过：域名非法、已有进行中扫描（CREATED/QUEUED/SCANNING）。
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@libsql/client";
import { CosmosClient } from "@azure/cosmos";
import Redis from "ioredis";
import {
  loadStackedEnv,
  resolveCosmos,
  resolveRedisUrl,
  resolveTsfDatabase,
} from "./lib/loadEnv.mjs";

const SHOP_SCAN_HINT_KEY = "tsf:shop_scan:hints";
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(name);
}

function argValue(name, fallback = null) {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 1).trim() || fallback;
}

function buildScanId(shop) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${shop}-${stamp}-${randomUUID().slice(0, 8)}`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid)";
  }
}

const overlay = argValue("--env", ".env.admin.test");
const dryRun = !hasFlag("--confirm-prod") || hasFlag("--dry-run");
const confirmProd = hasFlag("--confirm-prod");
const limitRaw = argValue("--limit", "");
const limit = limitRaw ? Math.max(1, Number.parseInt(limitRaw, 10) || 0) : null;
const offset = Math.max(0, Number.parseInt(argValue("--offset", "0"), 10) || 0);
const delayMs = Math.max(0, Number.parseInt(argValue("--delay-ms", "100"), 10) || 0);
const rehintPending = hasFlag("--rehint-pending");
const isProdOverlay = /prod/i.test(overlay);

if (isProdOverlay && !confirmProd && !hasFlag("--dry-run")) {
  // 允许默认 dry-run 看名单；真正写入必须 --confirm-prod
}

if (isProdOverlay && confirmProd && hasFlag("--dry-run")) {
  console.error("拒绝：不要同时带 --confirm-prod 与 --dry-run");
  process.exit(1);
}

if (isProdOverlay && !dryRun && !confirmProd) {
  console.error("拒绝：生产写入必须 --env=.env.admin.prod --confirm-prod");
  process.exit(1);
}

const { env, files } = loadStackedEnv({ overlay, applyToProcess: true });
const tsf = resolveTsfDatabase({ ...env, ...process.env });
const cosmos = resolveCosmos({ ...env, ...process.env });
const redisResolved = resolveRedisUrl({ ...env, ...process.env });

if (!tsf.url || !tsf.authToken) {
  console.error("缺少 TSF_DATABASE_URL / TSF_DATABASE_AUTH_TOKEN");
  process.exit(1);
}
if (!cosmos.endpoint || !cosmos.key) {
  console.error("缺少 COSMOS_ENDPOINT / COSMOS_KEY");
  process.exit(1);
}

const cosmosDbId =
  process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const cosmosContainerId =
  process.env.COSMOS_SHOP_SCAN_CONTAINER?.trim() || "shop_scan_jobs";

console.log("=== TSF enqueue shop profile scans ===");
console.log(`overlay:   ${overlay}`);
console.log(`env files: ${files.map((f) => f.replace(/\\/g, "/").split("/").pop()).join(" → ")}`);
console.log(`mode:      ${dryRun ? "DRY-RUN（不写 Cosmos/Redis）" : "WRITE"}`);
console.log(`tsf turso: ${hostOf(tsf.url)} (${tsf.urlKey})`);
console.log(`cosmos:    ${cosmos.endpoint.replace(/^https?:\/\//, "").slice(0, 48)}… / ${cosmosDbId}.${cosmosContainerId}`);
console.log(
  `redis:     ${redisResolved.url ? `${redisResolved.source}` : "未配置（仅写 Cosmos，Worker 靠轮询）"}`,
);
if (offset) console.log(`offset:    ${offset}`);
if (limit) console.log(`limit:     ${limit}`);
console.log(`delay-ms:  ${delayMs}`);
if (rehintPending) console.log(`rehint:    pending CREATED/QUEUED → Redis`);
console.log("");

const db = createClient({ url: tsf.url, authToken: tsf.authToken });

const sessionResult = await db.execute(`
  SELECT DISTINCT lower(trim(shop)) AS shop
  FROM Session
  WHERE shop IS NOT NULL
    AND trim(shop) <> ''
    AND isOnline = 0
    AND accessToken IS NOT NULL
    AND trim(accessToken) <> ''
  ORDER BY 1
`);

const allShops = sessionResult.rows
  .map((row) => String(row.shop ?? "").trim().toLowerCase())
  .filter(Boolean);

const invalidShops = allShops.filter((shop) => !SHOP_RE.test(shop));
const eligibleShops = allShops.filter((shop) => SHOP_RE.test(shop));
const targetShops =
  limit != null
    ? eligibleShops.slice(offset, offset + limit)
    : eligibleShops.slice(offset);

console.log(`offline Session 有 token 的店: ${allShops.length}`);
console.log(`域名非法跳过:                 ${invalidShops.length}`);
console.log(
  `将入队目标:                   ${targetShops.length}` +
    (offset || limit != null
      ? ` (offset=${offset}${limit != null ? `, limit=${limit}` : ""})`
      : ""),
);
if (invalidShops.length) {
  console.log(`非法域名样例: ${invalidShops.slice(0, 5).join(", ")}`);
}
console.log("");

if (targetShops.length === 0 && !rehintPending) {
  console.log("无目标店，退出。");
  process.exit(0);
}

const cosmosClient = new CosmosClient({
  endpoint: cosmos.endpoint,
  key: cosmos.key,
});
const container = cosmosClient.database(cosmosDbId).container(cosmosContainerId);

/** dry-run 不连 Redis；本地常解析不了 Render Internal hostname，hint 失败可降级为仅 Cosmos。 */
let redis = null;
if (!dryRun && redisResolved.url) {
  try {
    redis = new Redis(redisResolved.url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 8_000,
      lazyConnect: true,
      connectionName: "spark-tsf-enqueue-scan",
    });
    redis.on("error", (error) => {
      console.warn(
        `[redis] ${error instanceof Error ? error.message : error}`,
      );
    });
    await redis.connect();
  } catch (error) {
    console.warn(
      `[redis] connect failed, continue Cosmos-only: ${error instanceof Error ? error.message : error}`,
    );
    try {
      redis?.disconnect();
    } catch {
      // ignore
    }
    redis = null;
  }
}

const summary = {
  rehinted: 0,
  rehintFailed: 0,
  enqueued: 0,
  skippedActive: 0,
  failed: 0,
  hintPushed: 0,
  hintFailed: 0,
};

if (rehintPending) {
  console.log("=== rehint pending CREATED/QUEUED ===");
  if (dryRun) {
    const { resources } = await container.items
      .query({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.status IN ('CREATED', 'QUEUED')",
      })
      .fetchAll();
    summary.rehinted = Number(resources[0] ?? 0);
    console.log(`DRY-RUN would rehint ${summary.rehinted} pending job(s)`);
  } else if (!redis) {
    console.warn("Redis 不可用，跳过 rehint（Worker 仍可 Cosmos 轮询）");
  } else {
    const { resources: pending } = await container.items
      .query({
        query:
          "SELECT c.id, c.shopName, c.status FROM c WHERE c.status IN ('CREATED', 'QUEUED') ORDER BY c.createdAt ASC",
      })
      .fetchAll();
    console.log(`pending jobs: ${pending.length}`);
    for (const row of pending) {
      try {
        await redis.lpush(
          SHOP_SCAN_HINT_KEY,
          JSON.stringify({ scanId: row.id, shopName: row.shopName }),
        );
        summary.rehinted += 1;
      } catch (error) {
        summary.rehintFailed += 1;
        console.warn(
          `rehint fail ${row.shopName}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    try {
      console.log(`hint_queue_len=${await redis.llen(SHOP_SCAN_HINT_KEY)}`);
    } catch {
      // ignore
    }
  }
  console.log("");
}

if (targetShops.length === 0) {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
  console.log("=== summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("无新店需入队，仅完成 rehint。");
  process.exit(0);
}

async function hasActiveScan(shop) {
  const { resources } = await container.items
    .query(
      {
        query: `SELECT TOP 1 c.id, c.status, c.createdAt
                FROM c
                WHERE c.shopName = @shop
                  AND c.status IN ('CREATED', 'QUEUED', 'SCANNING')
                  ORDER BY c.createdAt DESC`,
        parameters: [{ name: "@shop", value: shop }],
      },
      { partitionKey: shop },
    )
    .fetchAll();
  return resources[0] ?? null;
}

console.log("=== enqueue shops ===");
for (let i = 0; i < targetShops.length; i += 1) {
  const shop = targetShops[i];
  const prefix = `[${i + 1}/${targetShops.length}] ${shop}`;

  try {
    const active = await hasActiveScan(shop);
    if (active) {
      summary.skippedActive += 1;
      console.log(`${prefix} SKIP active=${active.status} id=${active.id}`);
      continue;
    }

    const scanId = buildScanId(shop);
    const now = new Date().toISOString();
    const doc = {
      id: scanId,
      shopName: shop,
      trigger: "manual",
      status: "CREATED",
      stages: {
        contentSize: "PENDING",
        profile: "PENDING",
        coverage: "PENDING",
        glossary: "PENDING",
      },
      blobPrefix: `shop-profile/${shop}`,
      summary: {},
      claimedBy: null,
      claimedAt: null,
      lastHeartbeat: null,
      attempts: 0,
      errorMessage: null,
      errorStage: null,
      createdAt: now,
      updatedAt: now,
    };

    if (dryRun) {
      summary.enqueued += 1;
      console.log(`${prefix} DRY-RUN would enqueue scanId=${scanId}`);
    } else {
      await container.items.upsert(doc);
      summary.enqueued += 1;

      let hintOk = false;
      if (redis) {
        try {
          await redis.lpush(
            SHOP_SCAN_HINT_KEY,
            JSON.stringify({ scanId, shopName: shop }),
          );
          hintOk = true;
          summary.hintPushed += 1;
        } catch (error) {
          summary.hintFailed += 1;
          console.warn(
            `${prefix} Redis hint failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      console.log(
        `${prefix} ENQUEUED scanId=${scanId} hint=${hintOk ? "ok" : "none"}`,
      );
    }
  } catch (error) {
    summary.failed += 1;
    console.error(
      `${prefix} FAIL ${error instanceof Error ? error.message : error}`,
    );
  }

  if (delayMs > 0 && i < targetShops.length - 1) {
    await sleep(delayMs);
  }
}

if (redis) {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

console.log("\n=== summary ===");
console.log(JSON.stringify(summary, null, 2));
if (dryRun) {
  console.log(
    "\nDRY-RUN 完成。确认后执行：\n  node scripts/tsf-enqueue-shop-profile-scans.mjs --env=.env.admin.prod --confirm-prod",
  );
} else {
  console.log(
    "\n已写入 Cosmos（+ Redis hint）。请确认 TSF Worker 在跑；Admin 列表稍后刷新可见新画像。",
  );
}
