#!/usr/bin/env node
/**
 * 拉取 Render 服务日志（默认过去 24h），归因汇总并可选发送飞书机器人。
 *
 * 环境变量:
 *   RENDER_API_KEY      — Render API Key（GitHub: RENDER_APIKEY）
 *   RENDER_SERVICE_ID   — Web 服务 id，如 srv-xxx
 *   RENDER_OWNER_ID     — 可选；Render Workspace id（tea-/usr- 开头）。
 *                         未设则从 GET /v1/services/:id 自动解析，一般无需配置。
 *   FEISHU_WEBHOOK_URL  — 飞书自定义机器人 Webhook（完整 URL）
 *   DIGEST_LOOKBACK_HOURS — 仅调试：设正整数则改为「过去 N 小时」，覆盖北京昨日日历日
 *   DIGEST_MAX_PAGES      — 每类查询最多分页数，默认 30（每页最多 100 条）
 *   DIGEST_SKIP_FEISHU    — 设为 true 仅写本地报告不发飞书
 *   DIGEST_OUTPUT_DIR     — 默认 reports
 */
const fs = require("fs");
const path = require("path");
const {
  buildDigest,
  formatDigestMarkdown,
  formatFeishuPostContent,
} = require("./render-log-classify.cjs");
const {
  getBeijingYesterdayWindow,
  getLookbackWindow,
} = require("./beijing-digest-window.cjs");

const RENDER_API = "https://api.render.com/v1";

function env(name, fallback) {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

async function renderFetch(apiKey, urlPath, query = {}) {
  const url = new URL(`${RENDER_API}${urlPath}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Render API ${urlPath} HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return body;
}

async function resolveOwnerId(apiKey, serviceId, explicitOwnerId) {
  if (explicitOwnerId) return explicitOwnerId;
  const data = await renderFetch(apiKey, `/services/${serviceId}`);
  const svc = data.service ?? data;
  const ownerId = svc.ownerId ?? svc.owner_id ?? data.ownerId;
  if (!ownerId) {
    throw new Error(
      "无法从 Render 服务详情解析 ownerId，请设置环境变量 RENDER_OWNER_ID",
    );
  }
  return ownerId;
}

/**
 * 分页拉取日志；Render 使用 hasMore + nextStartTime/nextEndTime。
 */
async function fetchLogsWindow(params) {
  const {
    apiKey,
    ownerId,
    resourceId,
    startTime,
    endTime,
    extraQuery = {},
    maxPages,
  } = params;

  const all = [];
  let page = 0;
  let cursorStart = startTime;
  let cursorEnd = endTime;

  while (page < maxPages) {
    const body = await renderFetch(apiKey, "/logs", {
      ownerId,
      resource: resourceId,
      startTime: cursorStart,
      endTime: cursorEnd,
      direction: "forward",
      limit: 100,
      ...extraQuery,
    });

    const logs = body.logs ?? body.data ?? [];
    if (Array.isArray(logs)) all.push(...logs);

    if (!body.hasMore) break;
    if (!body.nextStartTime || !body.nextEndTime) break;
    cursorStart = body.nextStartTime;
    cursorEnd = body.nextEndTime;
    page += 1;
  }

  return all;
}

function dedupeLogs(logs) {
  const seen = new Set();
  const out = [];
  for (const log of logs) {
    const key = [
      log.id,
      log.timestamp,
      log.message ?? log.text,
      log.type,
      log.statusCode,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(log);
  }
  return out;
}

async function fetchAllRelevantLogs(apiKey, ownerId, serviceId, startIso, endIso) {
  const maxPages = Number(env("DIGEST_MAX_PAGES", "30"));
  const base = {
    apiKey,
    ownerId,
    resourceId: serviceId,
    startTime: startIso,
    endTime: endIso,
    maxPages,
  };

  const queries = [
    { type: ["app"], level: ["error"] },
    { type: ["app"], text: ["*error*", "*failed*", "*timeout*"] },
    { type: ["request"], statusCode: ["5*"] },
    { type: ["build"] },
  ];

  const batches = await Promise.all(
    queries.map((q) => fetchLogsWindow({ ...base, extraQuery: q })),
  );

  return dedupeLogs(batches.flat());
}

async function sendFeishu(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(
      `飞书 Webhook 失败 HTTP ${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
    );
  }
  return body;
}

function resolveTimeWindow() {
  const lookbackRaw = env("DIGEST_LOOKBACK_HOURS", "");
  const lookbackHours = lookbackRaw ? Number(lookbackRaw) : 0;
  if (lookbackRaw && Number.isFinite(lookbackHours) && lookbackHours > 0) {
    return {
      ...getLookbackWindow(lookbackHours),
      mode: "lookback",
    };
  }
  return {
    ...getBeijingYesterdayWindow(),
    mode: "beijing_yesterday",
  };
}

async function main() {
  const apiKey = requireEnv("RENDER_API_KEY");
  const serviceId = requireEnv("RENDER_SERVICE_ID");
  const ownerIdExplicit = env("RENDER_OWNER_ID", "");
  const skipFeishu = env("DIGEST_SKIP_FEISHU", "") === "true";
  const outputDir = env("DIGEST_OUTPUT_DIR", "reports");

  const { start, end, windowLabel, reportDate, mode } = resolveTimeWindow();

  console.info(
    `[render-digest] service=${serviceId} mode=${mode} window=${windowLabel}`,
  );
  console.info(
    `[render-digest] query ${start.toISOString()} .. ${end.toISOString()}`,
  );

  const ownerId = await resolveOwnerId(apiKey, serviceId, ownerIdExplicit);
  console.info(`[render-digest] ownerId=${ownerId}`);

  const logs = await fetchAllRelevantLogs(
    apiKey,
    ownerId,
    serviceId,
    start.toISOString(),
    end.toISOString(),
  );
  console.info(`[render-digest] fetched ${logs.length} log lines (deduped)`);

  const digest = buildDigest(logs, { serviceId, windowLabel });
  const markdown = formatDigestMarkdown(digest);
  const jsonPath = path.join(outputDir, `render-digest-${reportDate}.json`);
  const mdPath = path.join(outputDir, `render-digest-${reportDate}.md`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(digest, null, 2), "utf8");
  fs.writeFileSync(mdPath, markdown, "utf8");
  console.info(`[render-digest] wrote ${mdPath}`);

  if (!skipFeishu) {
    const webhook = requireEnv("FEISHU_WEBHOOK_URL");
    const payload = formatFeishuPostContent(digest);
    await sendFeishu(webhook, payload);
    console.info("[render-digest] Feishu notification sent");
  } else {
    console.info("[render-digest] DIGEST_SKIP_FEISHU=true, skip Feishu");
  }

  if (digest.hasIssues) {
    console.info(
      `[render-digest] done with ${digest.totalRelevant} relevant issues`,
    );
    process.exitCode = 0;
  } else {
    console.info("[render-digest] done, no issues");
  }
}

main().catch((err) => {
  console.error("[render-digest] fatal:", err);
  process.exit(1);
});
