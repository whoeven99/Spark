import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function createRunId(shop = "batch") {
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safeShop = shop.replace(/[^\w.-]+/g, "_").slice(0, 48);
  return `${safeShop}-${ts}`;
}

export function resolveReportDir(opts) {
  if (opts.reportDir) return resolve(opts.reportDir);
  const shop = opts.shop || (opts.allShops ? "all-shops" : "batch");
  return resolve("scripts/repair-reports", createRunId(shop));
}

/** 单条修复记录的标准结构（便于后续按 taskId / resourceId / digest 检索）。 */
export function normalizeFixRecord(job, fix) {
  return {
    taskId: fix.taskId ?? job.id,
    shopName: fix.shopName ?? job.shopName,
    source: fix.source ?? job.source,
    target: fix.target ?? job.target,
    resourceId: fix.resourceId,
    digest: fix.digest ?? "",
    module: fix.module,
    key: fix.key,
    translatedValue: fix.translatedValue ?? fix.after ?? "",
    attrCheckDecision: fix.attrCheckDecision ?? "",
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatIssuesShort(issues) {
  if (!issues?.length) return "";
  return issues
    .map((i) => `${i.attr}=${String(i.value ?? "").slice(0, 80)}`)
    .join(" | ");
}

function fixesIndexMarkdown(fixes) {
  const lines = [
    "# 已修复翻译数据索引",
    "",
    `共 **${fixes.length}** 条。完整译文见 [fixes.json](./fixes.json)。`,
    "",
    "| # | taskId | resourceId | digest | module | key | target |",
    "|---|---|---|---|---|---|---|",
  ];

  fixes.forEach((fix, i) => {
    const digestShort = fix.digest ? `\`${fix.digest.slice(0, 12)}…\`` : "—";
    lines.push(
      `| ${i + 1} | \`${fix.taskId}\` | \`${fix.resourceId}\` | ${digestShort} | ${fix.module} | \`${fix.key}\` | ${fix.target} |`,
    );
  });

  lines.push("");
  return lines.join("\n");
}

function attrChecksMarkdown(checks) {
  const lines = [
    "# 属性检查结果（alt / title / aria-label）",
    "",
    `共 **${checks.length}** 条。完整 JSON 见 [attr-checks.json](./attr-checks.json)。`,
    "",
    "| # | decision | blob | shopify | resourceId | key | reason |",
    "|---|---|---|---|---|---|---|",
  ];

  checks.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | \`${c.decision}\` | ${c.blobStatus} | ${c.shopifyStatus} | \`${c.resourceId}\` | \`${c.key}\` | ${String(c.reason ?? "").replace(/\|/g, "/")} |`,
    );
  });

  lines.push("");
  return lines.join("\n");
}

/**
 * 写入核心交付物：仅包含被修复的翻译数据 + 检索字段。
 */
export async function writeFixesCatalog(reportDir, fixes) {
  await mkdir(reportDir, { recursive: true });

  const fixesJson = resolve(reportDir, "fixes.json");
  const fixesCsv = resolve(reportDir, "fixes.csv");
  const fixesIndexMd = resolve(reportDir, "fixes.md");

  await writeFile(fixesJson, `${JSON.stringify(fixes, null, 2)}\n`, "utf8");

  const csvHeader = "taskId,shopName,source,target,resourceId,digest,module,key";
  const csvRows = fixes.map((fix) =>
    [
      csvEscape(fix.taskId),
      csvEscape(fix.shopName),
      csvEscape(fix.source),
      csvEscape(fix.target),
      csvEscape(fix.resourceId),
      csvEscape(fix.digest),
      csvEscape(fix.module),
      csvEscape(fix.key),
    ].join(","),
  );
  await writeFile(fixesCsv, `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(fixesIndexMd, `${fixesIndexMarkdown(fixes)}\n`, "utf8");

  return { fixesJson, fixesCsv, fixesIndexMd };
}

/** 写入属性检查结果（正常 / 异常原因 / 是否允许替换）。 */
export async function writeAttrChecksCatalog(reportDir, checks) {
  await mkdir(reportDir, { recursive: true });

  const attrChecksJson = resolve(reportDir, "attr-checks.json");
  const attrChecksCsv = resolve(reportDir, "attr-checks.csv");
  const attrChecksMd = resolve(reportDir, "attr-checks.md");

  await writeFile(attrChecksJson, `${JSON.stringify(checks, null, 2)}\n`, "utf8");

  const csvHeader =
    "taskId,shopName,source,target,resourceId,digest,module,key,blobStatus,shopifyStatus,decision,reason,blobIssues,shopifyIssues";
  const csvRows = checks.map((c) =>
    [
      csvEscape(c.taskId),
      csvEscape(c.shopName),
      csvEscape(c.source),
      csvEscape(c.target),
      csvEscape(c.resourceId),
      csvEscape(c.digest),
      csvEscape(c.module),
      csvEscape(c.key),
      csvEscape(c.blobStatus),
      csvEscape(c.shopifyStatus),
      csvEscape(c.decision),
      csvEscape(c.reason),
      csvEscape(formatIssuesShort(c.blobIssues)),
      csvEscape(formatIssuesShort(c.shopifyIssues)),
    ].join(","),
  );
  await writeFile(attrChecksCsv, `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(attrChecksMd, `${attrChecksMarkdown(checks)}\n`, "utf8");

  return { attrChecksJson, attrChecksCsv, attrChecksMd };
}

export async function writeBatchReport(reportDir, batch) {
  await mkdir(reportDir, { recursive: true });
  batch.generatedAt = new Date().toISOString();

  const allFixes = batch.allFixes ?? [];
  const allAttrChecks = batch.allAttrChecks ?? [];
  const fixPaths = await writeFixesCatalog(reportDir, allFixes);
  const attrPaths = await writeAttrChecksCatalog(reportDir, allAttrChecks);

  const summaryJson = resolve(reportDir, "summary.json");
  const summary = {
    generatedAt: batch.generatedAt,
    mode: batch.mode,
    apply: batch.apply,
    createdBefore: batch.createdBefore ?? null,
    totalJobs: batch.totalJobs,
    jobsProcessed: batch.jobsProcessed,
    jobsSkipped: batch.jobsSkipped,
    totalFieldsFixed: batch.totalFieldsFixed,
    totalFieldsWithLeaks: batch.totalFieldsWithLeaks,
    totalFieldsSkippedByAttrGate: batch.totalFieldsSkippedByAttrGate ?? 0,
    attrCheckCount: allAttrChecks.length,
    attrChecksRepair: batch.attrChecksRepair ?? 0,
    attrChecksSkipped: batch.attrChecksSkipped ?? 0,
    fixCount: allFixes.length,
    jobResults: batch.jobResults,
  };
  await writeFile(summaryJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return { ...fixPaths, ...attrPaths, summaryJson };
}

export async function initReportDir(reportDir, opts) {
  await mkdir(reportDir, { recursive: true });
  const readme = resolve(reportDir, "README.md");
  const text = [
    "# 修复数据导出",
    "",
    "**主文件：**",
    "",
    "| 文件 | 说明 |",
    "|---|---|",
    "| **fixes.json** | 全部已修复条目：`taskId`、`resourceId`、`digest`、`translatedValue` 等 |",
    "| **attr-checks.json** | 属性检查结果：Blob/Shopify 正常或异常、决策与原因 |",
    "| attr-checks.csv / .md | 属性检查索引 |",
    "| fixes.csv | 检索索引（不含长 HTML，方便 Excel 过滤） |",
    "| fixes.md | 索引表（Markdown） |",
    "| summary.json | 批量运行汇总 |",
    "",
    `命令: \`node scripts/repair-html-placeholder-leaks.mjs ${opts.allShops ? "--all-shops" : opts.shop ? `--shop=${opts.shop}` : opts.jobId ?? ""}\``,
    "",
  ].join("\n");
  await writeFile(readme, `${text}\n`, "utf8");
}
