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
 *   DIGEST_MAX_PAGES      — 每类查询最多分页数，默认 8（每页最多 100 条）
 *   DIGEST_QUERY_DELAY_MS — 两次查询之间的间隔，默认 2500
 *   DIGEST_PAGE_DELAY_MS  — 分页之间的间隔，默认 600
 *   DIGEST_RENDER_MAX_RETRIES — 429 时最大重试次数，默认 6
 *   DIGEST_SKIP_FEISHU    — true/1/yes 时不发飞书
 *   RENDER_SERVICE_DISPLAY_NAME — 报告/飞书中展示的服务名（yml 可填）；未设则用 service id
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

/** 识别 true / 1 / yes（GitHub input 偶发 True、带空格） */
function parseBoolEnv(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1" || raw === "yes";
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const maxRetries = Number(env("DIGEST_RENDER_MAX_RETRIES", "6"));
  const baseDelayMs = Number(env("DIGEST_RENDER_RETRY_BASE_MS", "2000"));

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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

    if (res.status === 429) {
      if (attempt >= maxRetries) {
        throw new Error(
          `Render API ${urlPath} HTTP 429: rate limit exceeded（已重试 ${maxRetries} 次）`,
        );
      }
      const retryAfterSec = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : baseDelayMs * 2 ** attempt;
      console.warn(
        `[render-digest] Render 429 rate limit, wait ${waitMs}ms then retry (${attempt + 1}/${maxRetries})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(
        `Render API ${urlPath} HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`,
      );
    }
    return body;
  }

  throw new Error(`Render API ${urlPath} 重试耗尽`);
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
    label = "logs",
  } = params;

  const pageDelayMs = Number(env("DIGEST_PAGE_DELAY_MS", "600"));
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

    if (page < maxPages && pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }

  if (page >= maxPages) {
    console.warn(
      `[render-digest] query ${label} hit DIGEST_MAX_PAGES=${maxPages}, results may be truncated`,
    );
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
  const maxPages = Number(env("DIGEST_MAX_PAGES", "8"));
  const queryDelayMs = Number(env("DIGEST_QUERY_DELAY_MS", "2500"));
  const base = {
    apiKey,
    ownerId,
    resourceId: serviceId,
    startTime: startIso,
    endTime: endIso,
    maxPages,
  };

  // 串行查询，避免 Promise.all 触发 Render Logs API 429；去掉宽泛 text 通配（与 error 重复且量大）
  const queries = [
    {
      label: "app-error",
      extraQuery: { type: ["app"], level: ["error"] },
    },
    {
      label: "request-5xx",
      extraQuery: { type: ["request"], statusCode: ["5*"] },
    },
    {
      label: "build",
      extraQuery: { type: ["build"] },
    },
  ];

  const merged = [];
  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i];
    console.info(`[render-digest] fetch ${q.label} (max ${maxPages} pages)...`);
    const batch = await fetchLogsWindow({
      ...base,
      extraQuery: q.extraQuery,
      label: q.label,
    });
    merged.push(...batch);
    if (i < queries.length - 1 && queryDelayMs > 0) {
      await sleep(queryDelayMs);
    }
  }

  return dedupeLogs(merged);
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
  const serviceLabel =
    env("RENDER_SERVICE_DISPLAY_NAME", "") || serviceId;
  const ownerIdExplicit = env("RENDER_OWNER_ID", "");
  const skipFeishu = parseBoolEnv("DIGEST_SKIP_FEISHU", false);
  const outputDir = env("DIGEST_OUTPUT_DIR", "reports");

  console.info(
    `[render-digest] DIGEST_SKIP_FEISHU raw="${process.env.DIGEST_SKIP_FEISHU ?? ""}" → skip=${skipFeishu}`,
  );
  console.info(
    `[render-digest] service label="${serviceLabel}" id=${serviceId}`,
  );

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

  const digest = buildDigest(logs, {
    serviceId,
    serviceLabel,
    windowLabel,
  });
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
