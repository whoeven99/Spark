#!/usr/bin/env node
/**
 * 查询哪些 shopName 的翻译 Blob 存在 HTML 属性占位符泄漏，需要跑修复脚本。
 *
 * 判定（与修复脚本 Blob 侧门禁一致）：
 *   任务 createdAt < 截止时间（默认 2026-07-08），且译文 HTML 的
 *   alt / title / aria-label 仍含 __HXLAT_* / ⟦Tn⟧ / u0000Tn u0000 等占位符。
 *
 * 默认只扫 PRODUCT / METAFIELD 模块的 HTML 字段。
 * 店内任一任务命中即输出并跳过该店剩余任务。
 *
 * 本脚本只读 Cosmos + Blob，不调 Shopify、不写回。
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
import {
  scanJobAttrLeaks,
  DEFAULT_HTML_SCAN_MODULES,
} from "./lib/scanHtmlAttrLeaks.mjs";

await loadDotEnv();

function printUsage() {
  console.log(`
查询需要 HTML 属性占位符修复的店铺列表（只读）。

用法:
  node scripts/find-shops-needing-html-repair.mjs [选项]

选项:
  --shop=SHOP            只扫指定店铺
  --shop-search=TEXT     按店名模糊过滤
  --shop-limit=N         最多扫描 N 个店铺
  --job-limit=N          每店最多扫 N 个任务（默认 500）
  --before=ISO           只扫 createdAt 早于此时间的任务（默认 ${DEFAULT_JOB_CREATED_BEFORE}）
  --include-recent       不按创建时间过滤
  --module=MODULE        仅扫单个模块（默认 PRODUCT + METAFIELD）
  --detail               输出命中样例（resourceId/key/属性摘要）
  --full-scan            店内扫完所有任务（默认命中即停）
  --concurrency=N        店铺并行数（默认 1，便于看进度）
  --out=PATH             写出 JSON 报告
  --out-txt=PATH         写出仅含 shopName 的纯文本（一行一个）
  --resume-from=SHOP     从指定店铺起继续扫描（跳过之前的店）
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
    concurrency: 1,
    out: "",
    outTxt: "",
    resumeFrom: "",
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
    if (arg.startsWith("--resume-from=")) {
      opts.resumeFrom = arg.slice("--resume-from=".length).trim().toLowerCase();
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

  opts.scanModules = opts.module ? [opts.module] : [...DEFAULT_HTML_SCAN_MODULES];
  return opts;
}

function formatModuleProgress(p) {
  if (p.layout === "resources") {
    const total = p.resourceTotal ?? 0;
    const done = p.resourceDone ?? 0;
    const pct = total > 0 ? ((done / total) * 100).toFixed(0) : "0";
    return `[${p.module}] 资源 ${done}/${total} (${pct}%)`;
  }
  if (p.layout === "chunks") {
    const ct = p.chunkTotal ?? 0;
    const cd = p.chunkDone ?? 0;
    return `[${p.module}] 分片 ${cd}/${ct} | 已扫资源 ${p.resourceDone ?? 0}`;
  }
  return `[${p.module ?? "?"}]`;
}

function printShopHit(shopResult, opts) {
  const job = shopResult.affectedJobs[0];
  const hit = shopResult.firstHit;
  console.log("");
  console.log(`>>> 需要修复: ${shopResult.shopName}`);
  if (job) {
    console.log(
      `    任务 ${job.jobId} | ${job.source} → ${job.target} | ${job.status} | 创建 ${job.createdAt ?? "?"}`,
    );
  }
  if (hit) {
    console.log(`    命中 ${hit.module} | ${hit.resourceId}`);
    console.log(`    key=${hit.key}`);
    console.log(`    属性: ${hit.summary}`);
  }
  console.log(`    （已跳过该店剩余 ${Math.max(0, shopResult.jobsInScope - shopResult.jobsScanned)} 个任务）`);
  console.log("");
}

function normalizeShop(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function writePartialReport(opts, batch) {
  if (!opts.out) return;
  const outPath = resolve(opts.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
}

async function scanShop(blob, cosmos, shopName, ctx) {
  const { opts, shopIndex, shopTotal } = ctx;
  const prefix = `[店铺 ${shopIndex}/${shopTotal}]`;

  const shopResult = {
    shopName,
    needsRepair: false,
    scanFailed: false,
    jobsTotal: 0,
    jobsInScope: 0,
    jobsScanned: 0,
    jobsWithAttrLeak: 0,
    jobsFailed: 0,
    fieldsWithAttrLeak: 0,
    fieldsWithHtmlLeak: 0,
    firstHit: null,
    sampleHits: [],
    affectedJobs: [],
    errors: [],
  };

  let jobsRaw;
  try {
    jobsRaw = await listJobsForShop(cosmos, shopName, { limit: opts.jobLimit || 500 });
  } catch (err) {
    shopResult.scanFailed = true;
    shopResult.errors.push({ phase: "list-jobs", message: String(err?.message ?? err) });
    console.error(`${prefix} ${shopName} — 拉取任务失败，跳过: ${err?.message ?? err}`);
    return shopResult;
  }

  const jobs = (opts.createdBefore
    ? jobsRaw.filter((j) => isJobBeforeCutoff(j, opts.createdBefore))
    : jobsRaw
  )
    .slice()
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  shopResult.jobsTotal = jobsRaw.length;
  shopResult.jobsInScope = jobs.length;

  const maxHitsPerJob = opts.fullScan ? 0 : 1;
  const stopOnShopHit = !opts.fullScan;

  console.log(`${prefix} ${shopName} | 范围内任务 ${jobs.length} | 模块 ${opts.scanModules.join(", ")}`);

  for (const job of jobs) {
    const jobNo = shopResult.jobsScanned + 1;
    console.log(
      `  ${prefix} 任务 ${jobNo}/${jobs.length} ${job.id} | ${job.source}→${job.target} | ${job.status}`,
    );

    let scan;
    try {
      scan = await scanJobAttrLeaks(blob, job, {
        maxHits: maxHitsPerJob,
        modules: opts.scanModules,
        onProgress: (p) => {
          if (p.phase === "module") {
            const errHint = p.errors > 0 ? ` | IO错 ${p.errors}` : "";
            process.stdout.write(`\r    ${prefix} ${formatModuleProgress(p)}${errHint}   `);
          }
        },
      });
      process.stdout.write("\n");
    } catch (err) {
      process.stdout.write("\n");
      shopResult.jobsFailed++;
      shopResult.errors.push({
        phase: "scan-job",
        jobId: job.id,
        message: String(err?.message ?? err),
      });
      console.error(
        `    ${prefix} 任务扫描失败，跳过: ${String(err?.message ?? err).slice(0, 120)}`,
      );
      shopResult.jobsScanned++;
      continue;
    }

    shopResult.jobsScanned++;
    shopResult.fieldsWithHtmlLeak += scan.fieldsWithHtmlLeak;
    shopResult.fieldsWithAttrLeak += scan.fieldsWithAttrLeak;
    if (scan.errors?.length) {
      shopResult.errors.push(...scan.errors.map((e) => ({ ...e, jobId: job.id })));
    }

    if (scan.skipped) {
      console.log(`    ${prefix} 跳过任务: ${scan.skipReason}`);
      continue;
    }

    const partialHint = scan.partial ? " | 部分 IO 失败已跳过" : "";
    console.log(
      `    ${prefix} 本任务: 模块 [${(scan.modulesScanned ?? []).join(", ") || "—"}] | 资源 ${scan.resourcesScanned} | HTML泄漏 ${scan.fieldsWithHtmlLeak} | 属性泄漏 ${scan.fieldsWithAttrLeak}${partialHint}`,
    );

    if (scan.fieldsWithAttrLeak > 0) {
      shopResult.needsRepair = true;
      shopResult.jobsWithAttrLeak++;
      const firstHit = scan.hits[0] ?? null;
      shopResult.firstHit = firstHit;
      shopResult.affectedJobs.push({
        jobId: job.id,
        source: job.source,
        target: job.target,
        status: job.status,
        createdAt: job.createdAt ?? null,
        fieldsWithAttrLeak: scan.fieldsWithAttrLeak,
        fieldsWithHtmlLeak: scan.fieldsWithHtmlLeak,
        firstHit,
      });
      if (opts.detail) {
        for (const hit of scan.hits) {
          if (shopResult.sampleHits.length >= 20) break;
          shopResult.sampleHits.push({ jobId: job.id, target: job.target, ...hit });
        }
      }
      printShopHit(shopResult, opts);
      if (stopOnShopHit) break;
    }
  }

  if (!shopResult.needsRepair && !shopResult.scanFailed) {
    const failHint = shopResult.jobsFailed > 0 ? `（${shopResult.jobsFailed} 个任务失败已跳过）` : "";
    console.log(
      `${prefix} ${shopName} — 未发现属性泄漏（已扫 ${shopResult.jobsScanned}/${jobs.length} 任务）${failHint}`,
    );
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

  if (opts.resumeFrom) {
    const needle = normalizeShop(opts.resumeFrom);
    const idx = shops.findIndex((s) => normalizeShop(s) === needle || normalizeShop(s).includes(needle));
    if (idx < 0) {
      console.error(`--resume-from 未找到店铺: ${opts.resumeFrom}`);
      process.exit(1);
    }
    console.log(`续扫: 跳过前 ${idx} 个店铺，从 ${shops[idx]} 开始`);
    shops = shops.slice(idx);
  }

  console.log(`店铺数: ${shops.length}`);
  console.log(
    opts.createdBefore
      ? `时间过滤: createdAt < ${opts.createdBefore}`
      : "时间过滤: 关闭",
  );
  console.log(`扫描模块: ${opts.scanModules.join(", ")}（仅 HTML 字段）`);
  console.log(
    opts.fullScan
      ? "店内策略: 扫完所有范围内任务"
      : "店内策略: 任一任务命中属性泄漏 → 立即输出并跳过该店剩余任务",
  );
  console.log(`店铺并行: ${opts.concurrency}`);
  console.log("");

  const shopResults = [];
  const needing = [];
  const failedShops = [];

  const batchState = () => ({
    generatedAt: new Date().toISOString(),
    createdBefore: opts.createdBefore || null,
    scanModules: opts.scanModules,
    fullScan: opts.fullScan,
    shopsScanned: shopResults.length,
    shopsNeedingRepair: needing.length,
    shopsFailed: failedShops.length,
    shopNames: needing.map((r) => r.shopName),
    shops: needing,
    failedShops,
    allShopResults: shopResults,
  });

  if (opts.concurrency <= 1) {
    for (let i = 0; i < shops.length; i++) {
      let result;
      try {
        result = await scanShop(blob, cosmos, shops[i], {
          opts,
          shopIndex: i + 1,
          shopTotal: shops.length,
        });
      } catch (err) {
        result = {
          shopName: shops[i],
          needsRepair: false,
          scanFailed: true,
          errors: [{ phase: "scan-shop", message: String(err?.message ?? err) }],
        };
        console.error(`[店铺 ${i + 1}/${shops.length}] ${shops[i]} 扫描异常，跳过: ${err?.message ?? err}`);
      }

      shopResults.push(result);
      if (result.needsRepair) needing.push(result);
      if (result.scanFailed) failedShops.push(result);

      console.log(
        `[汇总 ${i + 1}/${shops.length}] 需修复 ${needing.length} | 失败 ${failedShops.length}`,
      );
      await writePartialReport(opts, batchState());
    }
  } else {
    let done = 0;
    const results = await Promise.all(
      shops.map(async (shopName, i) => {
        let result;
        try {
          result = await scanShop(blob, cosmos, shopName, {
            opts,
            shopIndex: i + 1,
            shopTotal: shops.length,
          });
        } catch (err) {
          result = {
            shopName,
            needsRepair: false,
            scanFailed: true,
            errors: [{ phase: "scan-shop", message: String(err?.message ?? err) }],
          };
        }
        done++;
        if (result.needsRepair) needing.push(result);
        if (result.scanFailed) failedShops.push(result);
        process.stdout.write(
          `\r[汇总 ${done}/${shops.length}] 需修复 ${needing.length} | 失败 ${failedShops.length}   `,
        );
        return result;
      }),
    );
    process.stdout.write("\n");
    shopResults.push(...results);
  }

  needing.sort((a, b) => b.fieldsWithAttrLeak - a.fieldsWithAttrLeak);
  const clean = shopResults.filter((r) => !r.needsRepair);

  console.log("\n══ 需要 HTML 修复的店铺（汇总）══");
  if (needing.length === 0) {
    console.log("（无）");
  } else {
    for (const r of needing) {
      const job = r.affectedJobs[0];
      console.log(`- ${r.shopName}`);
      if (job?.firstHit) {
        console.log(
          `    ${job.jobId} ${job.target} | ${job.firstHit.resourceId} key=${job.firstHit.key}`,
        );
      }
    }
  }

  console.log("");
  console.log(
    `合计扫描店铺 ${shopResults.length} | 需要修复 ${needing.length} | 扫描失败 ${failedShops.length} | 无需 ${clean.length}`,
  );

  if (failedShops.length > 0) {
    console.log("\n扫描失败的店铺（可 --resume-from=店名 续扫）:");
    for (const r of failedShops) {
      console.log(`- ${r.shopName}: ${r.errors?.[0]?.message ?? "未知错误"}`);
    }
  }

  const report = batchState();
  report.generatedAt = new Date().toISOString();

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

  if (needing.length > 0) {
    console.log("\n# shopName 列表（可复制）");
    console.log(needing.map((r) => r.shopName).join("\n"));
  }
}

main().catch((err) => {
  console.error("\n致命错误:", err?.message ?? err);
  process.exit(1);
});
