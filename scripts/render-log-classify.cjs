/**
 * Render 日志行分类与摘要（供日报脚本与 node:test 共用）
 */

const CATEGORY_META = {
  deploy_build: { label: "部署/构建失败", hint: "检查 Render Deploy 与 build 日志" },
  http_5xx: { label: "HTTP 5xx 请求", hint: "查对应 path、上游超时与未捕获异常" },
  timeout: { label: "超时", hint: "Agent/外部 API/Render 等待 deploy 超时" },
  chat_agent: { label: "AI 聊天 Agent", hint: "invokeChatAgent / chat-stream" },
  generate_description: { label: "生成商品描述", hint: "GenerateDescription HTTP/LLM" },
  picture_translate: { label: "整图翻译", hint: "火山/Aidge/Blob 链路" },
  agent_run_log: { label: "AgentRunLog 写入", hint: "Cosmos spark_ops 权限或网络" },
  billing: { label: "计费/配额", hint: "订阅、token 余额、402" },
  cosmos_redis: { label: "Cosmos/Redis/DB", hint: "翻译或 Turso 依赖" },
  auth: { label: "鉴权/Session", hint: "Shopify OAuth、shop 不一致" },
  uncaught: { label: "未分类错误", hint: "需人工看堆栈" },
  other: { label: "其他告警", hint: "warning 或非典型 error 文本" },
};

function normalizeSignature(text) {
  return String(text || "")
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<ts>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d{5,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function logMessage(log) {
  return (
    log.message ??
    log.text ??
    log.msg ??
    (typeof log.content === "string" ? log.content : "") ??
    ""
  ).trim();
}

function classifyLog(log) {
  const message = logMessage(log);
  const level = String(log.level ?? "").toLowerCase();
  const type = String(log.type ?? "").toLowerCase();
  const statusCode = Number(log.statusCode ?? log.status_code ?? 0);

  const tests = [
    {
      id: "deploy_build",
      match: () =>
        type === "build" ||
        /build_failed|update_failed|deploy.*fail/i.test(message),
    },
    {
      id: "http_5xx",
      match: () =>
        (statusCode >= 500 && statusCode < 600) ||
        (type === "request" && /^5\d\d$/.test(String(log.statusCode ?? ""))),
    },
    {
      id: "timeout",
      match: () =>
        /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|deadline exceeded/i.test(
          message,
        ),
    },
    {
      id: "chat_agent",
      match: () =>
        /Chat agent error|invokeChatAgentStream|invokeChatAgent:/i.test(message),
    },
    {
      id: "generate_description",
      match: () =>
        /\[GenerateDescription\]|generateDescription.*error|"outcome":"error"/i.test(
          message,
        ),
    },
    {
      id: "picture_translate",
      match: () =>
        /\[PictureTranslate\].*fail|PictureTranslate.*error|整图翻译失败/i.test(
          message,
        ),
    },
    {
      id: "agent_run_log",
      match: () => /\[AgentRunLog\]/i.test(message),
    },
    {
      id: "billing",
      match: () =>
        /billing|BILLING_|token.*不足|errorCode.:402|"errorCode":402/i.test(
          message,
        ),
    },
    {
      id: "cosmos_redis",
      match: () =>
        /cosmos|COSMOS_|redis|REDIS_|libsql|Turso|ECONNREFUSED/i.test(message),
    },
    {
      id: "auth",
      match: () =>
        /authenticate\.admin|session|OAuth|shop 与当前会话|errorCode.:403/i.test(
          message,
        ),
    },
    {
      id: "uncaught",
      match: () =>
        level === "error" ||
        /uncaught|Unhandled|FATAL|Error:/i.test(message),
    },
    {
      id: "other",
      match: () =>
        level === "warn" ||
        level === "warning" ||
        /error|failed|failure/i.test(message),
    },
  ];

  for (const t of tests) {
    if (t.match()) return t.id;
  }
  return null;
}

function isRelevantLog(log) {
  const category = classifyLog(log);
  if (category) return true;
  const level = String(log.level ?? "").toLowerCase();
  return level === "error" || level === "critical";
}

/**
 * @param {Array<Record<string, unknown>>} logs
 */
function buildDigest(logs, options = {}) {
  const serviceId = options.serviceId ?? "unknown";
  const serviceLabel = options.serviceLabel ?? serviceId;
  const windowLabel = options.windowLabel ?? "";
  const categories = {};
  const samples = {};
  let skipped = 0;

  for (const log of logs) {
    if (!isRelevantLog(log)) {
      skipped += 1;
      continue;
    }
    const category = classifyLog(log) ?? "other";
    categories[category] = (categories[category] ?? 0) + 1;

    const message = logMessage(log);
    const sig = normalizeSignature(message);
    if (!samples[category]) samples[category] = new Map();
    const bucket = samples[category];
    if (!bucket.has(sig)) {
      bucket.set(sig, {
        count: 0,
        message: message.slice(0, 240),
        timestamp: log.timestamp ?? log.createdAt ?? null,
      });
    }
    const entry = bucket.get(sig);
    entry.count += 1;
    if (log.timestamp && (!entry.timestamp || log.timestamp > entry.timestamp)) {
      entry.timestamp = log.timestamp;
    }
  }

  const totalRelevant = Object.values(categories).reduce((a, b) => a + b, 0);

  const categoryRows = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      label: CATEGORY_META[id]?.label ?? id,
      hint: CATEGORY_META[id]?.hint ?? "",
      count,
      topSamples: [...(samples[id]?.values() ?? [])]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }));

  return {
    serviceId,
    serviceLabel,
    windowLabel,
    generatedAt: new Date().toISOString(),
    totalLogsScanned: logs.length,
    totalRelevant,
    skippedIrrelevant: skipped,
    categories: categoryRows,
    hasIssues: totalRelevant > 0,
  };
}

function formatDigestMarkdown(digest) {
  const lines = [
    `# Spark Render 日志日报`,
    ``,
    `- 服务: **${digest.serviceLabel}**` +
      (digest.serviceLabel !== digest.serviceId
        ? `（\`${digest.serviceId}\`）`
        : ""),
    `- 窗口: ${digest.windowLabel}`,
    `- 生成: ${digest.generatedAt}`,
    `- 扫描条数: ${digest.totalLogsScanned}（相关 ${digest.totalRelevant}）`,
    ``,
  ];

  if (!digest.hasIssues) {
    lines.push(`## 结论`, ``, `昨日窗口内未发现需关注的错误/超时日志。`, ``);
    return lines.join("\n");
  }

  lines.push(`## 归因汇总`, ``);
  lines.push(`| 类别 | 条数 | 说明 |`);
  lines.push(`|------|------|------|`);
  for (const row of digest.categories) {
    lines.push(`| ${row.label} | ${row.count} | ${row.hint} |`);
  }
  lines.push(``);

  for (const row of digest.categories) {
    lines.push(`### ${row.label}（${row.count}）`);
    for (const s of row.topSamples) {
      lines.push(
        `- （×${s.count}）\`${s.timestamp ?? "—"}\` ${s.message.replace(/\|/g, "\\|")}`,
      );
    }
    lines.push(``);
  }

  return lines.join("\n");
}

function formatFeishuPostContent(digest) {
  const title = digest.hasIssues
    ? `Spark Render 日报 · ${digest.totalRelevant} 条需关注`
    : `Spark Render 日报 · 正常`;

  const blocks = [];
  blocks.push([
    {
      tag: "text",
      text: `服务 ${digest.serviceLabel}\n窗口 ${digest.windowLabel}\n`,
    },
  ]);

  if (!digest.hasIssues) {
    blocks.push([{ tag: "text", text: "昨日无错误/超时类日志。" }]);
  } else {
    for (const row of digest.categories.slice(0, 8)) {
      const sample = row.topSamples[0];
      const sampleText = sample
        ? `\n  例: ${sample.message.slice(0, 100)}`
        : "";
      blocks.push([
        {
          tag: "text",
          text: `【${row.label}】${row.count} 条 — ${row.hint}${sampleText}\n`,
        },
      ]);
    }
    if (digest.categories.length > 8) {
      blocks.push([
        {
          tag: "text",
          text: `…另有 ${digest.categories.length - 8} 类，见 GitHub Artifacts\n`,
        },
      ]);
    }
  }

  blocks.push([
    {
      tag: "a",
      text: "Render Dashboard",
      href: `https://dashboard.render.com/web/${digest.serviceId}`,
    },
  ]);

  return {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title,
          content: blocks,
        },
      },
    },
  };
}

module.exports = {
  CATEGORY_META,
  classifyLog,
  isRelevantLog,
  buildDigest,
  formatDigestMarkdown,
  formatFeishuPostContent,
  logMessage,
  normalizeSignature,
};
