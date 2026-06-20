#!/usr/bin/env node
/**
 * 翻译 V4 一键诊断：Cosmos 任务状态 + Blob init/translate/writeback 对照 + 可选质量报告。
 *
 * Usage:
 *   node scripts/translation-playbook-check.mjs <jobIdOrPrefix>
 *   node scripts/translation-playbook-check.mjs e4a398ba --wait --until complete
 *   npm run translation:check -- b533af43 --wait
 *
 * Options:
 *   --shop <myshop.myshopify.com>   指定店铺（多店/前缀冲突时）
 *   --wait                          轮询 Cosmos 直到 --until 条件满足
 *   --until translate|writeback|complete   默认 complete
 *   --wait-timeout-ms <n>             默认 1800000（30 分钟）
 *   --poll-ms <n>                     默认 15000
 *   --out <dir>                       输出目录（默认 translation-reports/<shop>-<jobId>/playbook）
 *   --report                          调用 worker exportTranslationReport（默认开启）
 *   --no-report
 *   --fail-on <a,b,c>                 见 docs/translation-playbook.md；默认全部开启
 *   --json                            仅打印 summary JSON 到 stdout
 *
 * 环境变量（根目录 .env）：
 *   AZURE_BLOB_CONNECTION_STRING
 *   COSMOS_ENDPOINT, COSMOS_KEY
 *   可选：COSMOS_TRANSLATION_DATABASE_ID, COSMOS_TRANSLATION_V4_JOBS_CONTAINER
 */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadEnv,
  getBlobContainer,
  getCosmosJobsContainer,
  readBlobJson,
  resolveJob,
  fetchCosmosJob,
  TERMINAL_STATUSES,
  UNTIL_STATUS,
  repoRoot,
} from "./lib/playbook-env.mjs";

const DEFAULT_FAIL_ON = [
  "pipeline-failed",
  "fake-completed",
  "writeback-all-failed",
  "verify-all-failed",
  "init-missing-body",
  "translate-empty-body",
  "high-fallback",
];

function parseArgs(argv) {
  const positional = [];
  const opts = {
    shop: null,
    wait: false,
    until: "complete",
    waitTimeoutMs: 1_800_000,
    pollMs: 15_000,
    out: null,
    report: true,
    failOn: [...DEFAULT_FAIL_ON],
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--shop") opts.shop = argv[++i];
    else if (a === "--wait") opts.wait = true;
    else if (a === "--until") opts.until = argv[++i];
    else if (a === "--wait-timeout-ms") opts.waitTimeoutMs = Number(argv[++i]);
    else if (a === "--poll-ms") opts.pollMs = Number(argv[++i]);
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--report") opts.report = true;
    else if (a === "--no-report") opts.report = false;
    else if (a === "--json") opts.json = true;
    else if (a === "--fail-on") opts.failOn = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (!a.startsWith("-")) positional.push(a);
    else throw new Error(`未知参数: ${a}`);
  }

  return { positional, opts };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJob(jobsContainer, shop, jobId, opts) {
  const allowed = UNTIL_STATUS[opts.until];
  if (!allowed) throw new Error(`--until 必须是 translate | writeback | complete`);

  const deadline = Date.now() + opts.waitTimeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await fetchCosmosJob(jobsContainer, shop, jobId);
    if (!last) throw new Error(`Cosmos 中无任务 ${shop}/${jobId}`);

    if (allowed.has(last.status)) {
      console.log(`[playbook] 等待结束 status=${last.status} (until=${opts.until})`);
      return last;
    }

    const m = last.metrics ?? {};
    console.log(
      `[playbook] 等待中… status=${last.status} init=${m.initDone}/${m.initTotal} ` +
        `translate=${m.translateDone}/${m.translateTotal} writeback=${m.writebackDone}/${m.writebackTotal}`,
    );
    await sleep(opts.pollMs);
  }

  throw new Error(`等待超时（${opts.waitTimeoutMs}ms），最后状态: ${last?.status ?? "?"}`);
}

async function listInitChunkPaths(container, prefix) {
  const paths = [];
  for await (const b of container.listBlobsFlat({ prefix: `${prefix}/init/` })) {
    if (b.name.endsWith(".json")) paths.push(b.name);
  }
  return paths.sort();
}

async function analyzePipeline(container, shop, jobId, job) {
  const prefix = `tasks/v4/${shop}/${jobId}`;
  const metrics = job?.metrics ?? {};
  const issues = [];

  const initPaths = await listInitChunkPaths(container, prefix);
  const initResources = [];
  for (const p of initPaths) {
    const chunk = await readBlobJson(container, p);
    if (!chunk) continue;
    const module = p.split("/").slice(-2)[0];
    for (const r of chunk) {
      initResources.push({ module, resourceId: r.resourceId, fields: r.fields ?? [] });
    }
  }

  const translateEntries = [];
  for await (const b of container.listBlobsFlat({ prefix: `${prefix}/translate/` })) {
    if (!b.name.endsWith(".json") || b.name.endsWith("fallbacks.json")) continue;
    const module = b.name.split("/").slice(-2)[0];
    const chunk = await readBlobJson(container, b.name);
    if (!chunk) continue;
    for (const r of chunk) {
      for (const t of r.translations ?? []) {
        translateEntries.push({
          module,
          resourceId: r.resourceId,
          key: t.key,
          originalValue: t.originalValue ?? "",
          translatedValue: t.translatedValue ?? "",
          status: t.status ?? "translated",
        });
      }
    }
  }

  const txByResource = new Map();
  for (const e of translateEntries) {
    const k = `${e.module}::${e.resourceId}`;
    if (!txByResource.has(k)) txByResource.set(k, []);
    txByResource.get(k).push(e);
  }

  const initMissingBody = [];
  const translateEmptyBody = [];
  let fallbackCount = 0;
  let fieldCount = 0;

  for (const r of initResources) {
    const keys = new Set(r.fields.map((f) => f.key));
    const title = r.fields.find((f) => f.key === "title");
    const body = r.fields.find((f) => f.key === "body_html");

    if (
      (r.module === "ARTICLE" || r.module === "PAGE") &&
      title?.value?.trim() &&
      !keys.has("body_html")
    ) {
      initMissingBody.push({
        module: r.module,
        resourceId: r.resourceId,
        title: title.value.slice(0, 80),
        hint: "init 仅有 title/handle，无 body_html — 多为 init 过滤或 Shopify 已有空译文占位",
      });
    }

    if (body?.value?.trim()) {
      const tx = (txByResource.get(`${r.module}::${r.resourceId}`) ?? []).find((t) => t.key === "body_html");
      if (!tx || !tx.translatedValue?.trim()) {
        translateEmptyBody.push({
          module: r.module,
          resourceId: r.resourceId,
          originalLen: body.value.length,
          hint: "init 有 body_html，translate 为空或缺失",
        });
      }
    }
  }

  for (const e of translateEntries) {
    if (e.key === "handle") continue;
    fieldCount++;
    if (e.status === "fallback") fallbackCount++;
  }

  const writebackProgress = await readBlobJson(container, `${prefix}/writeback/progress.json`);
  const writebackFailed = await readBlobJson(container, `${prefix}/writeback/failed.json`);
  const writtenCount = writebackProgress?.written?.length ?? 0;
  const failedCount = Array.isArray(writebackFailed) ? writebackFailed.length : 0;

  if (job?.status === "FAILED") {
    issues.push({
      code: "pipeline-failed",
      message: `任务 FAILED: ${job.errorStage ?? "?"} — ${job.errorMessage ?? ""}`,
    });
  }

  if (
    job?.status === "COMPLETED" &&
    (metrics.writebackTotal ?? 0) > 0 &&
    (metrics.writebackDone ?? 0) === 0 &&
    (metrics.writebackFailed ?? 0) > 0
  ) {
    issues.push({
      code: "fake-completed",
      message: `状态 COMPLETED 但写回 0/${metrics.writebackTotal}，writebackFailed=${metrics.writebackFailed}`,
    });
  }

  if ((metrics.writebackDone ?? 0) === 0 && (metrics.writebackFailed ?? 0) > 0) {
    issues.push({
      code: "writeback-all-failed",
      message: `写回全部失败 writebackFailed=${metrics.writebackFailed}（见 writeback/failed.json）`,
    });
  }

  if (
    (metrics.verifyTotal ?? 0) > 0 &&
    (metrics.verifyDone ?? 0) === 0 &&
    (metrics.verifyFailed ?? 0) > 0
  ) {
    issues.push({
      code: "verify-all-failed",
      message: `校验 0/${metrics.verifyTotal}，verifyFailed=${metrics.verifyFailed}`,
    });
  }

  if (initMissingBody.length) {
    issues.push({
      code: "init-missing-body",
      message: `${initMissingBody.length} 篇资源 init 无 body_html（见 samples.initMissingBody）`,
      count: initMissingBody.length,
    });
  }

  if (translateEmptyBody.length) {
    issues.push({
      code: "translate-empty-body",
      message: `${translateEmptyBody.length} 篇 body_html 未产出译文`,
      count: translateEmptyBody.length,
    });
  }

  const fallbackPct = fieldCount ? (100 * fallbackCount) / fieldCount : 0;
  if (fieldCount > 0 && fallbackPct > 10) {
    issues.push({
      code: "high-fallback",
      message: `fallback 占比 ${fallbackPct.toFixed(1)}%（${fallbackCount}/${fieldCount}）`,
    });
  }

  return {
    initResourceCount: initResources.length,
    initChunkPaths: initPaths.length,
    translateFieldCount: fieldCount,
    fallbackCount,
    fallbackPct,
    writtenCount,
    failedCount,
    initMissingBody: initMissingBody.slice(0, 20),
    translateEmptyBody: translateEmptyBody.slice(0, 20),
    issues,
    metrics,
    status: job?.status ?? null,
    source: job?.source,
    target: job?.target,
  };
}

function runExportReport(shop, jobId, outDir) {
  const workerDir = join(repoRoot(), "worker");
  const reportDir = join(outDir, "export-report");
  console.log(`[playbook] 运行 exportTranslationReport → ${reportDir}`);
  const r = spawnSync(
    "npx",
    ["tsx", "src/scripts/exportTranslationReport.ts", shop, jobId, reportDir],
    { cwd: workerDir, stdio: "inherit", env: process.env, shell: true },
  );
  return r.status === 0 ? reportDir : null;
}

function printHuman(summary) {
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log("翻译 Playbook 诊断摘要");
  console.log(line);
  console.log(`任务:   ${summary.jobId}`);
  console.log(`店铺:   ${summary.shop}`);
  console.log(`语言:   ${summary.analysis.source ?? "?"} → ${summary.analysis.target ?? "?"}`);
  console.log(`状态:   ${summary.analysis.status ?? "?"}`);
  console.log(
    `进度:   init ${summary.analysis.metrics.initDone}/${summary.analysis.metrics.initTotal} · ` +
      `translate ${summary.analysis.metrics.translateDone}/${summary.analysis.metrics.translateTotal} · ` +
      `writeback ${summary.analysis.metrics.writebackDone}/${summary.analysis.metrics.writebackTotal} · ` +
      `verify ${summary.analysis.metrics.verifyDone}/${summary.analysis.metrics.verifyTotal}`,
  );
  console.log(
    `Blob:   init 资源 ${summary.analysis.initResourceCount} · translate 字段 ${summary.analysis.translateFieldCount} · ` +
      `写回记录 ${summary.analysis.writtenCount} · failed.json ${summary.analysis.failedCount}`,
  );

  if (summary.analysis.issues.length === 0) {
    console.log("\n✅ 未发现 playbook 默认检查项问题");
  } else {
    console.log("\n❌ 发现问题:");
    for (const i of summary.analysis.issues) {
      console.log(`  • [${i.code}] ${i.message}`);
    }
  }

  if (summary.analysis.initMissingBody.length) {
    console.log("\ninit 缺 body_html（样例）:");
    for (const s of summary.analysis.initMissingBody.slice(0, 5)) {
      console.log(`  ${s.module} ${s.resourceId.slice(-12)}  title=${JSON.stringify(s.title)}`);
    }
  }

  if (summary.analysis.translateEmptyBody.length) {
    console.log("\ntranslate body 为空（样例）:");
    for (const s of summary.analysis.translateEmptyBody.slice(0, 5)) {
      console.log(`  ${s.module} ${s.resourceId.slice(-12)}  origLen=${s.originalLen}`);
    }
  }

  console.log(`\n详细 JSON: ${summary.outDir}/summary.json`);
  if (summary.reportDir) console.log(`质量报告: ${summary.reportDir}/report.json`);
  console.log(`\n下一步: 见 docs/translation-playbook.md`);
  console.log(line);
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (opts.help || !positional[0]) {
    console.log(`Usage: node scripts/translation-playbook-check.mjs <jobIdOrPrefix> [options]

Run with --help in docs/translation-playbook.md for the full iteration loop.`);
    process.exit(opts.help ? 0 : 1);
  }

  const env = loadEnv();
  const { container } = getBlobContainer(env);
  const jobsContainer = getCosmosJobsContainer(env);

  const { shop, jobId } = await resolveJob(container, positional[0], opts.shop);
  let job = await fetchCosmosJob(jobsContainer, shop, jobId);

  if (opts.wait) {
    job = await waitForJob(jobsContainer, shop, jobId, opts);
  } else if (!job) {
    console.warn("[playbook] Cosmos 未读到任务，仅分析 Blob（任务可能来自 TSF 且 Cosmos 分区不同）");
  }

  const analysis = await analyzePipeline(container, shop, jobId, job);
  const outDir = opts.out || join(repoRoot(), "translation-reports", `${shop}-${jobId}`, "playbook");
  await mkdir(outDir, { recursive: true });

  let reportDir = null;
  if (opts.report && analysis.translateFieldCount > 0) {
    reportDir = runExportReport(shop, jobId, outDir);
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    shop,
    jobId,
    outDir,
    reportDir,
    job: job
      ? {
          status: job.status,
          errorStage: job.errorStage,
          errorMessage: job.errorMessage,
          metrics: job.metrics,
          source: job.source,
          target: job.target,
        }
      : null,
    analysis,
    exitIssues: analysis.issues.filter((i) => opts.failOn.includes(i.code)),
  };

  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary);
  }

  process.exit(summary.exitIssues.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[playbook] ERROR:", e.message);
  process.exit(2);
});
