#!/usr/bin/env node
/**
 * 修复翻译 Blob 中 HTML 占位符泄漏，并可选触发 Shopify 写回。
 *
 * 用法：
 *   # 单任务
 *   node scripts/repair-html-placeholder-leaks.mjs <jobId> --shop=xxx.myshopify.com [--apply]
 *
 *   # 单店全部任务（不限状态）
 *   node scripts/repair-html-placeholder-leaks.mjs --shop=xxx.myshopify.com [--apply]
 *
 *   # 全部店铺（扫描所有用户）
 *   node scripts/repair-html-placeholder-leaks.mjs --all-shops [--apply]
 *
 * 默认 dry-run；--apply 会写回 Blob 并排队 WRITEBACK_QUEUED + Redis hint。
 *
 * 属性门禁：仅当 Blob 与 Shopify 现网的 alt/title/aria-label 均有占位符泄漏时才替换。
 * 默认只处理 createdAt < 2026-07-08T00:00:00.000Z 的任务。
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDotEnv } from "./lib/loadDotEnv.mjs";
import {
  createRedisClient,
  getBlobContainer,
  getCosmosJobsContainer,
  listAllShops,
  listJobsForShop,
  loadJob,
} from "./lib/translationStorage.mjs";
import {
  repairTranslationJob,
  COMMON_TM_MODELS,
  DEFAULT_JOB_CREATED_BEFORE,
  isJobBeforeCutoff,
} from "./lib/repairTranslationJob.mjs";
import {
  canTriggerWriteback,
  triggerShopifyWriteback,
} from "./lib/triggerWriteback.mjs";
import {
  initReportDir,
  normalizeFixRecord,
  resolveReportDir,
  writeBatchReport,
  writeFixesCatalog,
  writeAttrChecksCatalog,
} from "./lib/repairReport.mjs";

await loadDotEnv();

function printUsage() {
  console.log(`
修复翻译任务 Blob 中 HTML 属性/文本占位符泄漏，并触发 Shopify 写回。

用法:
  node scripts/repair-html-placeholder-leaks.mjs [jobId] [选项]

模式（三选一）:
  <jobId>              处理单个任务（推荐配合 --shop）
  --shop=SHOP          处理该店铺全部任务（不限 COMPLETED 状态）
  --all-shops          扫描并处理 Cosmos 中全部店铺

选项:
  --apply              写回 Blob + 触发 Shopify 写回（默认 dry-run）
  --skip-writeback     仅写 Blob，不触发 Shopify 写回（需配合 --apply）
  --force              对进行中的任务也强制排队写回
  --model=MODEL        TM 查询主模型
  --json-progress=PATH 进度 JSON（批量默认 scripts/.repair-progress-batch.json）
  --no-json-progress   不写进度文件
  --limit=N            每任务最多处理 N 个资源
  --job-limit=N        每店铺最多处理 N 个任务（批量模式）
  --shop-limit=N       --all-shops 时最多处理 N 个店铺
  --shop-search=TEXT   --all-shops 时按店名模糊过滤
  --module=MODULE      仅处理指定模块（METAFIELD / PRODUCT 等）
  --before=ISO         只处理 createdAt 早于此时间的任务（默认 ${DEFAULT_JOB_CREATED_BEFORE}）
  --include-recent     不按创建时间过滤（覆盖 --before）
  --report-dir=PATH    报告目录（默认 scripts/repair-reports/<shop>-<时间>）
  --no-report          不生成本地报告
  --help               显示帮助

属性门禁:
  1. 先查 Blob 译文的 alt / title / aria-label 是否仍有占位符泄漏
  2. Blob 正常 → 整段跳过
  3. Blob 异常 → 对照 Shopify 现网同 resourceId/key；现网正常则跳过，双端异常才替换
`);
}

function parseArgs(argv) {
  const opts = {
    jobId: "",
    shop: "",
    allShops: false,
    apply: false,
    skipWriteback: false,
    force: false,
    model: "",
    jsonProgress: "",
    noJsonProgress: false,
    limit: 0,
    jobLimit: 0,
    shopLimit: 0,
    shopSearch: "",
    module: "",
    reportDir: "",
    noReport: false,
    createdBefore: DEFAULT_JOB_CREATED_BEFORE,
    includeRecent: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--skip-writeback") {
      opts.skipWriteback = true;
      continue;
    }
    if (arg === "--force") {
      opts.force = true;
      continue;
    }
    if (arg === "--all-shops") {
      opts.allShops = true;
      continue;
    }
    if (arg === "--no-json-progress") {
      opts.noJsonProgress = true;
      continue;
    }
    if (arg === "--include-recent") {
      opts.includeRecent = true;
      continue;
    }
    if (arg.startsWith("--shop=")) {
      opts.shop = arg.slice("--shop=".length).trim();
      continue;
    }
    if (arg.startsWith("--model=")) {
      opts.model = arg.slice("--model=".length).trim();
      continue;
    }
    if (arg.startsWith("--json-progress=")) {
      opts.jsonProgress = arg.slice("--json-progress=".length).trim();
      continue;
    }
    if (arg.startsWith("--limit=")) {
      opts.limit = Math.max(0, Number(arg.slice("--limit=".length)) || 0);
      continue;
    }
    if (arg.startsWith("--job-limit=")) {
      opts.jobLimit = Math.max(0, Number(arg.slice("--job-limit=".length)) || 0);
      continue;
    }
    if (arg.startsWith("--shop-limit=")) {
      opts.shopLimit = Math.max(0, Number(arg.slice("--shop-limit=".length)) || 0);
      continue;
    }
    if (arg.startsWith("--shop-search=")) {
      opts.shopSearch = arg.slice("--shop-search=".length).trim();
      continue;
    }
    if (arg.startsWith("--module=")) {
      opts.module = arg.slice("--module=".length).trim();
      continue;
    }
    if (arg.startsWith("--before=")) {
      opts.createdBefore = arg.slice("--before=".length).trim();
      continue;
    }
    if (arg === "--no-report") {
      opts.noReport = true;
      continue;
    }
    if (arg.startsWith("--report-dir=")) {
      opts.reportDir = arg.slice("--report-dir=".length).trim();
      continue;
    }
    if (!arg.startsWith("-") && !opts.jobId) {
      opts.jobId = arg.trim();
      continue;
    }
    console.error(`未知参数: ${arg}`);
    printUsage();
    process.exit(1);
  }

  if (!opts.jobId && !opts.shop && !opts.allShops) {
    printUsage();
    process.exit(1);
  }
  if (opts.jobId && opts.allShops) {
    console.error("不能同时指定 jobId 与 --all-shops");
    process.exit(1);
  }

  if (opts.includeRecent) {
    opts.createdBefore = "";
  } else if (opts.createdBefore && Number.isNaN(Date.parse(opts.createdBefore))) {
    console.error(`无效 --before 时间: ${opts.createdBefore}`);
    process.exit(1);
  }

  if (!opts.noJsonProgress && !opts.jsonProgress) {
    opts.jsonProgress = resolve(
      opts.jobId
        ? `scripts/.repair-progress-${opts.jobId}.json`
        : "scripts/.repair-progress-batch.json",
    );
  }

  return opts;
}

function bar(pct, width = 24) {
  const filled = Math.round((pct / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

async function writeProgressFile(path, data) {
  if (!path) return;
  await writeFile(path, `${JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

async function resolveJobList(cosmos, opts) {
  if (opts.jobId) {
    const job = await loadJob(cosmos, opts.jobId, opts.shop);
    return job ? [job] : [];
  }

  const shops = opts.allShops
    ? await listAllShops(cosmos, { limit: opts.shopLimit, search: opts.shopSearch })
    : [opts.shop];

  const jobs = [];
  for (const shopName of shops) {
    const shopJobs = await listJobsForShop(cosmos, shopName, {
      limit: opts.jobLimit || 500,
    });
    jobs.push(...shopJobs);
  }
  return jobs;
}

function filterJobsByCreatedBefore(jobs, createdBefore) {
  if (!createdBefore) return { kept: jobs, dropped: [] };
  const kept = [];
  const dropped = [];
  for (const job of jobs) {
    if (isJobBeforeCutoff(job, createdBefore)) kept.push(job);
    else dropped.push(job);
  }
  return { kept, dropped };
}

async function processOneJob(job, ctx) {
  const { cosmos, blob, redis, opts, batch, reportDir } = ctx;

  console.log(`\n── 任务 ${job.id} ──`);
  console.log(
    `店铺 ${job.shopName} | ${job.source} → ${job.target} | 状态 ${job.status} | 创建 ${job.createdAt ?? "(无)"}`,
  );

  const writebackCheck = canTriggerWriteback(job, { force: opts.force });
  if (!writebackCheck.ok && opts.apply && !opts.skipWriteback) {
    console.log(`写回预检: ${writebackCheck.reason}`);
  }

  const models = opts.model ? [opts.model, ...COMMON_TM_MODELS] : undefined;
  let lastPrint = 0;

  const formatJobProgress = (p) => {
    if (p.phase === "loading" && p.loadPhase) {
      const { module, listed, loaded } = p.loadPhase;
      const pct = listed > 0 ? ((loaded / listed) * 100).toFixed(1) : "0.0";
      return `加载 Blob [${module}] ${loaded}/${listed} (${pct}%)`;
    }
    const pct = p.totalResources > 0 ? ((p.resourcesDone / p.totalResources) * 100).toFixed(1) : "0.0";
    return `[${bar(Number(pct))}] ${pct}% | 资源 ${p.resourcesDone}/${p.totalResources} | 泄漏 ${p.fieldsWithLeaks} | 门禁跳过 ${p.fieldsSkippedByAttrGate} | 修复 ${p.fieldsFixed}`;
  };

  const { progress, repairedResourceIds, skipped, skipReason } = await repairTranslationJob({
    job,
    blobContainer: blob,
    redis,
    apply: opts.apply,
    moduleFilter: opts.module,
    resourceLimit: opts.limit,
    models,
    createdBefore: opts.createdBefore,
    onProgress: async (p) => {
      const now = Date.now();
      if (now - lastPrint < 300) return;
      lastPrint = now;
      process.stdout.write(`\r  ${formatJobProgress(p)}`);
    },
  });

  process.stdout.write("\n");

  if (skipped) {
    console.log(`跳过: ${skipReason}`);
    batch.jobsSkipped++;
    batch.jobResults.push({
      jobId: job.id,
      shop: job.shopName,
      source: job.source,
      target: job.target,
      status: job.status,
      createdAt: job.createdAt ?? null,
      skipped: true,
      skipReason,
      fieldsWithLeaks: 0,
      fieldsFixed: 0,
      fieldsSkippedByAttrGate: 0,
      blobsWritten: 0,
      writebackQueued: false,
    });
    return { progress, writeback: null };
  }

  batch.jobsProcessed++;
  batch.totalFieldsWithLeaks += progress.fieldsWithLeaks;
  batch.totalFieldsFixed += progress.fieldsFixed;
  batch.totalFieldsSkippedByAttrGate += progress.fieldsSkippedByAttrGate;
  batch.totalBlobsWritten += progress.blobsWritten;
  batch.attrChecksRepair += progress.attrChecksRepair;
  batch.attrChecksSkipped += progress.attrChecksSkipped;

  console.log(
    `扫描 ${progress.totalResources} 资源 | 泄漏 ${progress.fieldsWithLeaks} 字段 | 属性门禁跳过 ${progress.fieldsSkippedByAttrGate} | 修复 ${progress.fieldsFixed} | Blob 写回 ${progress.blobsWritten}`,
  );
  if (progress.tokenSource) {
    console.log(`Shopify token 来源: ${progress.tokenSource}`);
  }

  let writeback = null;
  if (repairedResourceIds.size > 0 && opts.apply && !opts.skipWriteback) {
    const fullJob = (await loadJob(cosmos, job.id, job.shopName)) ?? job;
    writeback = await triggerShopifyWriteback({
      cosmos,
      blob,
      redis,
      job: fullJob,
      repairedResourceIds,
      dryRun: false,
      force: opts.force,
    });
    if (writeback.queued) {
      progress.writebackQueued = true;
      progress.writebackHintPushed = writeback.hintPushed;
      batch.writebackQueued++;
      console.log(
        `已排队 Shopify 写回: ${job.status} → WRITEBACK_QUEUED | 重试资源 ${writeback.plan.repairedResources} | hint=${writeback.hintPushed ? "已推" : "未推"}`,
      );
    } else {
      progress.writebackSkipReason = writeback.reason ?? "未知";
      console.log(`写回未排队: ${progress.writebackSkipReason}`);
    }
  } else if (repairedResourceIds.size > 0 && !opts.apply) {
    const fullJob = (await loadJob(cosmos, job.id, job.shopName)) ?? job;
    writeback = await triggerShopifyWriteback({
      cosmos,
      blob,
      redis,
      job: fullJob,
      repairedResourceIds,
      dryRun: true,
      force: opts.force,
    });
    console.log(
      `（dry-run）写回计划: 重试 ${writeback.plan?.repairedResources ?? repairedResourceIds.size} 资源 → WRITEBACK_QUEUED`,
    );
  }

  for (const fix of progress.fixes) {
    batch.allFixes.push(normalizeFixRecord(job, fix));
  }
  for (const check of progress.attrChecks) {
    batch.allAttrChecks.push(check);
  }

  batch.jobResults.push({
    jobId: job.id,
    shop: job.shopName,
    source: job.source,
    target: job.target,
    status: job.status,
    createdAt: job.createdAt ?? null,
    fieldsWithLeaks: progress.fieldsWithLeaks,
    fieldsFixed: progress.fieldsFixed,
    fieldsSkippedByAttrGate: progress.fieldsSkippedByAttrGate,
    attrChecksRepair: progress.attrChecksRepair,
    attrChecksSkipped: progress.attrChecksSkipped,
    blobsWritten: progress.blobsWritten,
    writebackQueued: progress.writebackQueued,
    writebackSkipReason: progress.writebackSkipReason,
    tokenSource: progress.tokenSource,
  });

  if (reportDir) {
    if (progress.fixes.length > 0) {
      await writeFixesCatalog(reportDir, batch.allFixes);
      console.log(`  已更新 fixes.json（当前合计 ${batch.allFixes.length} 条）`);
    }
    if (progress.attrChecks.length > 0) {
      await writeAttrChecksCatalog(reportDir, batch.allAttrChecks);
      console.log(`  已更新 attr-checks.json（当前合计 ${batch.allAttrChecks.length} 条）`);
    }
  }

  return { progress, writeback };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const cosmos = getCosmosJobsContainer();
  const blob = getBlobContainer();
  const redis = createRedisClient();
  if (redis) await redis.connect().catch(() => {});

  const allJobs = await resolveJobList(cosmos, opts);
  if (allJobs.length === 0) {
    console.error("未找到可处理的任务。");
    process.exit(1);
  }

  const { kept: jobs, dropped } = filterJobsByCreatedBefore(allJobs, opts.createdBefore);
  if (jobs.length === 0) {
    console.error(
      `找到 ${allJobs.length} 个任务，但均不满足 createdAt < ${opts.createdBefore || "(无截止)"}。可用 --include-recent 关闭时间过滤。`,
    );
    process.exit(1);
  }

  const modeLabel = opts.allShops
    ? `全部店铺${opts.shopSearch ? `（过滤: ${opts.shopSearch}）` : ""}`
    : opts.shop && !opts.jobId
      ? `店铺 ${opts.shop} 全部任务`
      : `单任务 ${opts.jobId}`;

  console.log(`模式: ${modeLabel}`);
  console.log(`任务数: ${jobs.length}${dropped.length ? `（另有 ${dropped.length} 个因创建时间跳过）` : ""}`);
  console.log(
    opts.createdBefore
      ? `时间过滤: createdAt < ${opts.createdBefore}`
      : "时间过滤: 关闭（--include-recent）",
  );
  console.log(
    opts.apply
      ? opts.skipWriteback
        ? "执行: APPLY（仅 Blob）"
        : "执行: APPLY（Blob + Shopify 写回）"
      : "执行: DRY-RUN",
  );
  console.log("属性门禁: Blob 与 Shopify 双端 alt/title/aria-label 均异常才替换");
  if (opts.jsonProgress) console.log(`进度文件: ${opts.jsonProgress}`);

  const reportDir = opts.noReport ? "" : resolveReportDir(opts);
  if (reportDir) {
    await initReportDir(reportDir, opts);
    console.log(`报告目录: ${reportDir}`);
  }
  console.log("");

  const batch = {
    mode: modeLabel,
    apply: opts.apply,
    skipWriteback: opts.skipWriteback,
    createdBefore: opts.createdBefore || null,
    totalJobs: jobs.length,
    jobsDone: 0,
    jobsProcessed: 0,
    jobsSkipped: 0,
    totalFieldsWithLeaks: 0,
    totalFieldsFixed: 0,
    totalFieldsSkippedByAttrGate: 0,
    totalBlobsWritten: 0,
    writebackQueued: 0,
    attrChecksRepair: 0,
    attrChecksSkipped: 0,
    jobResults: [],
    allFixes: [],
    allAttrChecks: [],
  };

  await writeProgressFile(opts.jsonProgress, batch);

  for (const job of jobs) {
    await processOneJob(job, { cosmos, blob, redis, opts, batch, reportDir });
    batch.jobsDone++;
    batch.percent = Math.round((batch.jobsDone / batch.totalJobs) * 1000) / 10;
    await writeProgressFile(opts.jsonProgress, batch);

    const pct = batch.percent.toFixed(1);
    process.stdout.write(
      `\r[${bar(Number(pct), 32)}] 任务 ${batch.jobsDone}/${batch.totalJobs} (${pct}%) | 修复 ${batch.totalFieldsFixed} 字段 | 门禁跳过 ${batch.totalFieldsSkippedByAttrGate} | 写回排队 ${batch.writebackQueued}`,
    );
  }

  process.stdout.write("\n\n");
  console.log("══ 批量汇总 ══");
  console.log(`任务总数       ${batch.totalJobs}`);
  console.log(`已处理         ${batch.jobsProcessed}`);
  console.log(`跳过           ${batch.jobsSkipped}`);
  console.log(`泄漏字段合计   ${batch.totalFieldsWithLeaks}`);
  console.log(`属性门禁跳过   ${batch.totalFieldsSkippedByAttrGate}`);
  console.log(`属性检查-可修  ${batch.attrChecksRepair}`);
  console.log(`属性检查-跳过  ${batch.attrChecksSkipped}`);
  console.log(`修复字段合计   ${batch.totalFieldsFixed}`);
  console.log(`Blob 写回      ${batch.totalBlobsWritten}`);
  console.log(`写回排队       ${batch.writebackQueued}`);

  if (!opts.apply && batch.totalFieldsFixed > 0) {
    console.log("\n提示: dry-run 完成。确认后加 --apply 写回 Blob 并触发 Shopify 写回。");
  }

  if (opts.jsonProgress) {
    await writeProgressFile(opts.jsonProgress, batch);
    console.log(`\n进度数据: ${opts.jsonProgress}`);
  }

  if (reportDir) {
    const paths = await writeBatchReport(reportDir, batch);
    console.log(`\n修复数据导出:`);
    console.log(`  fixes.json        ${paths.fixesJson}（${batch.allFixes.length} 条）`);
    console.log(`  attr-checks.json  ${paths.attrChecksJson}（${batch.allAttrChecks.length} 条）`);
    console.log(`  attr-checks.csv   ${paths.attrChecksCsv}`);
    console.log(`  attr-checks.md    ${paths.attrChecksMd}`);
    console.log(`  fixes.csv         ${paths.fixesCsv}`);
    console.log(`  fixes.md          ${paths.fixesIndexMd}`);
  }

  if (redis) await redis.quit().catch(() => {});
}

main().catch((err) => {
  console.error("\n执行失败:", err?.message ?? err);
  process.exit(1);
});
