#!/usr/bin/env node
/**
 * 查询哪些 shopName 的翻译 Blob 存在 HTML 属性占位符泄漏，需要跑修复脚本。
 *
 * 判定（与修复脚本 Blob 侧门禁一致）：
 *   任务 createdAt < 截止时间（默认 2026-07-08），且译文 HTML 的
 *   alt / title / aria-label 仍含 __HXLAT_* / ⟦Tn⟧ / u0000Tn u0000 等占位符。
 *
 * 本脚本只读 Cosmos + Blob，不调 Shopify、不写回。
 *
 * 用法:
 *   node scripts/find-shops-needing-html-repair.mjs
 *   node scripts/find-shops-needing-html-repair.mjs --shop-search=ciwi
 *   node scripts/find-shops-needing-html-repair.mjs --shop-limit=20 --detail
 *   node scripts/find-shops-needing-html-repair.mjs --out=scripts/shops-need-html-repair.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDotEnv } from "./lib/loadDotEnv.mjs";
import {
  getBlobContainer,
  getCosmosJobsContainer,
  listAllShops,
  listJobsForShop,
} from "./lib/translationStorage.mjs";
import {
  DEFAULT_JOB_CREATED_BEFORE,
  isJobBeforeCutoff,
} from "./lib/repairTranslationJob.mjs";
import { scanJobAttrLeaks } from "./lib/scanHtmlAttrLeaks.mjs";

await loadDotEnv();

function printUsage() {
  console.log(`
查询需要 HTML 属性占位符修复的店铺列表（只读）。

用法:
  node scripts/find-shops-needing-html-repair.mjs [选项]

选项:
  --shop=SHOP            只扫指定店铺
  --shop-search=TEXT     按店名模糊过滤
  --shop-limit=N         最多扫描 N 个店铺（默认不限制，上限同 listAllShops）
  --job-limit=N          每店最多扫 N 个任务（默认 500）
  --before=ISO           只扫 createdAt 早于此时间的任务（默认 ${DEFAULT_JOB_CREATED_BEFORE}）
  --include-recent       不按创建时间过滤
  --module=MODULE        仅扫指定模块
  --detail               输出命中样例（resourceId/key/属性摘要）
  --full-scan            不提前结束：统计每店全部命中字段数（更慢）
  --concurrency=N        店铺并行数（默认 2）
  --out=PATH             写出 JSON 报告
  --out-txt=PATH         写出仅含 shopName 的纯文本（一行一个）
  --help                 显示帮助
`);
}

function parseArgs(argv) {
  const opts = {
    shop: "",
    shopSearch: "",
    shopLimit: 0,
    jobLimit: 500,
    createdBefore: DEFAULT_JOB_CREATED_BEFORE,
    includeRecent: false,
    module: "",
    detail: false,
    fullScan: false,
    concurrency: 2,
    out: "",
    outTxt: "",
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--include-recent") {
      opts.includeRecent = true;
      continue;
    }
    if (arg === "--detail") {
      opts.detail = true;
      continue;
    }
    if (arg === "--full-scan") {
      opts.fullScan = true;
      continue;
    }
    if (arg.startsWith("--shop=")) {
      opts.shop = arg.slice("--shop=".length).trim();
      continue;
    }
    if (arg.startsWith("--shop-search=")) {
      opts.shopSearch = arg.slice("--shop-search=".length).trim();
      continue;
    }
    if (arg.startsWith("--shop-limit=")) {
      opts.shopLimit = Math.max(0, Number(arg.slice("--shop-limit=".length)) || 0);
      continue;
    }
    if (arg.startsWith("--job-limit=")) {
      opts.jobLimit = Math.max(0, Number(arg.slice("--job-limit=".length)) || 0);
      continue;
    }
    if (arg.startsWith("--before=")) {
      opts.createdBefore = arg.slice("--before=".length).trim();
      continue;
    }
    if (arg.startsWith("--module=")) {
      opts.module = arg.slice("--module=".length).trim();
      continue;
    }
    if (arg.startsWith("--concurrency=")) {
      opts.concurrency = Math.max(1, Number(arg.slice("--concurrency=".length)) || 1);
      continue;
    }
    if (arg.startsWith("--out=")) {
      opts.out = arg.slice("--out=".length).trim();
      continue;
    }
    if (arg.startsWith("--out-txt=")) {
      opts.outTxt = arg.slice("--out-txt=".length).trim();
      continue;
    }
    console.error(`未知参数: ${arg}`);
    printUsage();
    process.exit(1);
  }

  if (opts.includeRecent) opts.createdBefore = "";
  else if (opts.createdBefore && Number.isNaN(Date.parse(opts.createdBefore))) {
    console.error(`无效 --before: ${opts.createdBefore}`);
    process.exit(1);
  }

  return opts;
}

async function parallelMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanShop(blob, cosmos, shopName, opts) {
  const jobsRaw = await listJobsForShop(cosmos, shopName, { limit: opts.jobLimit || 500 });
  const jobs = (opts.createdBefore
    ? jobsRaw.filter((j) => isJobBeforeCutoff(j, opts.createdBefore))
    : jobsRaw
  )
    // 旧任务更可能有泄漏：升序扫，快速发现更快命中
    .slice()
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  const shopResult = {
    shopName,
    needsRepair: false,
    jobsTotal: jobsRaw.length,
    jobsInScope: jobs.length,
    jobsScanned: 0,
    jobsWithAttrLeak: 0,
    fieldsWithAttrLeak: 0,
    fieldsWithHtmlLeak: 0,
    sampleHits: [],
    affectedJobs: [],
  };

  const maxHitsPerJob = opts.fullScan ? 0 : 1;
  // 发现模式：店内一旦命中属性泄漏即可标记 needsRepair 并停止（除非 --full-scan）
  const stopOnShopHit = !opts.fullScan;

  for (const job of jobs) {
    process.stdout.write(
      `\r  … ${shopName} 任务 ${shopResult.jobsScanned + 1}/${jobs.length} ${job.id.slice(0, 8)}… (${job.target})   `,
    );
    const scan = await scanJobAttrLeaks(blob, job, {
      maxHits: maxHitsPerJob,
      moduleFilter: opts.module,
    });
    shopResult.jobsScanned++;
    shopResult.fieldsWithHtmlLeak += scan.fieldsWithHtmlLeak;
    shopResult.fieldsWithAttrLeak += scan.fieldsWithAttrLeak;

    if (scan.fieldsWithAttrLeak > 0) {
      shopResult.needsRepair = true;
      shopResult.jobsWithAttrLeak++;
      shopResult.affectedJobs.push({
        jobId: job.id,
        source: job.source,
        target: job.target,
        status: job.status,
        createdAt: job.createdAt ?? null,
        fieldsWithAttrLeak: scan.fieldsWithAttrLeak,
        fieldsWithHtmlLeak: scan.fieldsWithHtmlLeak,
      });
      if (opts.detail) {
        for (const hit of scan.hits) {
          if (shopResult.sampleHits.length >= 20) break;
          shopResult.sampleHits.push({
            jobId: job.id,
            target: job.target,
            ...hit,
          });
        }
      }
      if (stopOnShopHit) break;
    }
  }

  return shopResult;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cosmos = getCosmosJobsContainer();
  const blob = getBlobContainer();

  let shops;
  if (opts.shop) {
    shops = [opts.shop];
  } else {
    shops = await listAllShops(cosmos, {
      limit: opts.shopLimit || 10_000,
      search: opts.shopSearch,
    });
  }

  console.log(`店铺数: ${shops.length}`);
  console.log(
    opts.createdBefore
      ? `时间过滤: createdAt < ${opts.createdBefore}`
      : "时间过滤: 关闭",
  );
  console.log(
    opts.fullScan
      ? "扫描模式: 全量统计（每店扫完所有范围内任务）"
      : "扫描模式: 快速发现（每任务命中 1 条即停；店内一旦命中即标记并跳过剩余任务）",
  );
  console.log("");

  let done = 0;
  const shopResults = await parallelMap(shops, opts.concurrency, async (shopName) => {
    const result = await scanShop(blob, cosmos, shopName, opts);
    done++;
    const flag = result.needsRepair ? "NEED" : "ok  ";
    process.stdout.write(
      `\r[${done}/${shops.length}] ${flag} ${shopName} | 范围内任务 ${result.jobsInScope} | 属性泄漏字段 ${result.fieldsWithAttrLeak}   `,
    );
    return result;
  });

  process.stdout.write("\n\n");

  const needing = shopResults.filter((r) => r.needsRepair).sort((a, b) => b.fieldsWithAttrLeak - a.fieldsWithAttrLeak);
  const clean = shopResults.filter((r) => !r.needsRepair);

  console.log("══ 需要 HTML 修复的店铺 ══");
  if (needing.length === 0) {
    console.log("（无）");
  } else {
    for (const r of needing) {
      console.log(
        `- ${r.shopName}  属性泄漏字段≈${r.fieldsWithAttrLeak}  命中任务 ${r.jobsWithAttrLeak}/${r.jobsInScope}`,
      );
      if (opts.detail && r.sampleHits.length) {
        for (const hit of r.sampleHits.slice(0, 5)) {
          console.log(
            `    · ${hit.jobId} ${hit.target} ${hit.resourceId} key=${hit.key} | ${hit.summary}`,
          );
        }
      }
    }
  }

  console.log("");
  console.log(`合计扫描店铺 ${shopResults.length} | 需要修复 ${needing.length} | 无需 ${clean.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    createdBefore: opts.createdBefore || null,
    fullScan: opts.fullScan,
    shopsScanned: shopResults.length,
    shopsNeedingRepair: needing.length,
    shopNames: needing.map((r) => r.shopName),
    shops: needing,
  };

  if (opts.out) {
    const outPath = resolve(opts.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nJSON: ${outPath}`);
  }

  if (opts.outTxt) {
    const outPath = resolve(opts.outTxt);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${needing.map((r) => r.shopName).join("\n")}${needing.length ? "\n" : ""}`, "utf8");
    console.log(`TXT:  ${outPath}`);
  }

  // 默认也打印可复制的店名列表
  if (needing.length > 0) {
    console.log("\n# shopName 列表（可复制）");
    console.log(needing.map((r) => r.shopName).join("\n"));
  }
}

main().catch((err) => {
  console.error("\n执行失败:", err?.message ?? err);
  process.exit(1);
});
