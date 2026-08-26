import { z } from "zod";
import type { HealthMonitorRecord, HealthMonitorStatus } from "./healthMonitorData";

const nonEmptyStringSchema = z.string().trim().min(1);
const safeMonitorNameSchema = z.string().trim().min(1).catch("unknown_monitor");

const monitorGroupSchema = z.enum(["site_health", "business_health"]);
const statusSchema = z.enum(["good", "watch", "risk"]);
const scoringSchema = z.enum(["high", "medium", "low"]);
const prioritySchema = z.enum(["P0", "P1", "P2"]);
const sourceSchema = z.enum(["shopify", "ga4", "ads", "gsc", "pagespeed", "internal"]);
const objectTypeSchema = z.enum(["page", "sku", "channel", "campaign", "landing_page", "order", "other"]);

export const monitorDetailInputSchema = z.object({
  version: z.literal("v1"),
  monitor: z.object({
    id: nonEmptyStringSchema,
    name: safeMonitorNameSchema,
    group: monitorGroupSchema,
    label: nonEmptyStringSchema,
    status: statusSchema,
  }),
  timeWindow: z.object({
    label: nonEmptyStringSchema,
    startAt: z.string().optional(),
    endAt: z.string().optional(),
  }),
  scoring: z.object({
    dataQuality: scoringSchema,
    confidence: scoringSchema,
  }),
  coreMetric: z.object({
    label: nonEmptyStringSchema,
    value: nonEmptyStringSchema,
    unit: z.string().optional(),
    direction: z.enum(["up", "down", "flat"]).optional(),
  }),
  /** null = 没有可比基准口径。页面据此不渲染基准卡，禁止回退成常量。 */
  benchmark: z
    .object({
      label: nonEmptyStringSchema,
      value: nonEmptyStringSchema,
      delta: z.string().optional(),
      direction: z.enum(["better", "worse", "flat"]),
    })
    .nullable(),
  facts: z.array(
    z.object({
      label: nonEmptyStringSchema,
      value: nonEmptyStringSchema,
      source: sourceSchema,
    }),
  ).min(1),
  affectedObjects: z.array(
    z.object({
      type: objectTypeSchema,
      name: nonEmptyStringSchema,
      summary: z.string().optional(),
    }),
  ).optional(),
  possibleCauses: z.array(nonEmptyStringSchema).optional(),
  candidateActions: z.array(
    z.object({
      title: nonEmptyStringSchema,
      detail: nonEmptyStringSchema,
      priority: prioritySchema,
    }),
  ).optional(),
  generationTrace: z.object({
    dataFacts: z.array(nonEmptyStringSchema).min(1),
    rulesApplied: z.array(nonEmptyStringSchema).min(1),
    benchmarkComparisons: z.array(nonEmptyStringSchema).min(1),
  }),
});

export const monitorDetailResultSchema = z.object({
  problem: nonEmptyStringSchema.max(120),
  evidenceSummary: z.array(
    z.object({
      label: nonEmptyStringSchema,
      summary: nonEmptyStringSchema,
    }),
  ).min(1).max(4),
  actions: z.array(
    z.object({
      title: nonEmptyStringSchema,
      detail: nonEmptyStringSchema,
      priority: prioritySchema,
    }),
  ).min(1).max(4),
  aiChatPrompt: nonEmptyStringSchema.max(400),
});

export type MonitorDetailInput = z.infer<typeof monitorDetailInputSchema>;
export type MonitorDetailResult = z.infer<typeof monitorDetailResultSchema>;

export function buildMonitorDetailInput(
  monitor: HealthMonitorRecord,
  timeWindowOverride?: { label: string; startAt?: string; endAt?: string },
): MonitorDetailInput {
  const inferredWindow = timeWindowOverride ?? {
    label: inferTimeWindowLabel(monitor),
  };
  const input: MonitorDetailInput = {
    version: "v1",
    monitor: {
      id: monitor.id,
      name: toSnakeCase(monitor.title) || monitor.id,
      group: monitor.group === "可信度健康" ? "site_health" : "business_health",
      label: monitor.title,
      status: monitor.status,
    },
    timeWindow: inferredWindow,
    scoring: {
      dataQuality: inferDataQuality(monitor),
      confidence: inferConfidence(monitor),
    },
    coreMetric: {
      label: inferCoreMetricLabel(monitor),
      value: monitor.value,
      unit: inferUnit(monitor.value),
      direction: inferDirection(monitor.status),
    },
    benchmark: buildBenchmark(monitor),
    facts: monitor.evidence.map((entry) => ({
      label: entry.label,
      value: entry.value,
      source: inferSource(monitor.id, entry.label),
    })),
    affectedObjects: monitor.relatedObjects?.length ? monitor.relatedObjects : inferAffectedObjects(monitor),
    possibleCauses: [monitor.summary],
    candidateActions: monitor.actions.map((action, index) => ({
      title: action.title,
      detail: action.detail,
      priority: index === 0 ? "P0" : index === 1 ? "P1" : "P2",
    })),
    generationTrace: {
      dataFacts: [monitor.value, ...monitor.evidence.slice(0, 2).map((entry) => entry.value)],
      rulesApplied: [buildRuleTrace(monitor.status, monitor.title)],
      benchmarkComparisons: [buildBenchmarkTrace(monitor)],
    },
  };

  const parsed = monitorDetailInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  console.error("[health-monitor] invalid detail input:", parsed.error.flatten());
  return buildFallbackHealthMonitorDetail(monitor).input;
}

export function buildMonitorDetailPrompt(input: MonitorDetailInput) {
  return {
    system: [
      "你是 Spark 的电商经营分析助手。",
      "你会收到一份健康度监测详情输入 JSON。",
      "你的任务不是重新计算数据，也不是虚构新的事实，而是基于输入中已经提供的事实、规则和基准比较，生成一份固定结构的详情结果。",
      "只能使用输入中明确提供的信息，不要编造新数据、新原因或新对象。",
      "problem 只能输出一句简洁判断。",
      "evidenceSummary 输出 2-4 条，每条都必须能映射到输入中的 facts、benchmark 或 generationTrace。",
      "actions 输出 2-4 条，优先使用 candidateActions。",
      "aiChatPrompt 必须适合作为后续 AI 对话的起始 prompt。",
      "输出必须是合法 JSON，不要输出 markdown，不要输出额外字段。",
    ].join("\n"),
    user: [
      "请基于以下 MonitorDetailInput，生成 MonitorDetailResult。",
      '输出结构必须为：{"problem": string, "evidenceSummary": [{"label": string, "summary": string}], "actions": [{"title": string, "detail": string, "priority": "P0" | "P1" | "P2"}], "aiChatPrompt": string}',
      "",
      "MonitorDetailInput:",
      JSON.stringify(input, null, 2),
    ].join("\n"),
  };
}

export function generateMonitorDetailResult(input: MonitorDetailInput): MonitorDetailResult {
  const result: MonitorDetailResult = {
    problem: buildProblem(input),
    evidenceSummary: input.facts.slice(0, 3).map((fact) => ({
      label: fact.label,
      summary: fact.value,
    })),
    actions: (input.candidateActions ?? []).slice(0, 3),
    aiChatPrompt: buildAiChatPrompt(input),
  };

  const parsed = monitorDetailResultSchema.safeParse(result);
  if (parsed.success) return parsed.data;
  console.error("[health-monitor] invalid detail result:", parsed.error.flatten());
  return buildFallbackHealthMonitorDetail({
    id: input.monitor.id,
      group: input.monitor.group === "site_health" ? "可信度健康" : "目标健康",
      relatedModule: "全局",
    title: input.monitor.label,
    value: input.coreMetric.value,
    status: input.monitor.status,
    summary: input.facts[0]?.value ?? input.monitor.label,
    issue: input.facts[0]?.value ?? input.monitor.label,
    evidence: input.facts.slice(0, 3).map((fact) => ({
      label: fact.label,
      value: fact.value,
    })),
    actions: (input.candidateActions ?? []).slice(0, 3).map((action) => ({
      title: action.title,
      detail: action.detail,
    })),
    aiPrompt: buildAiChatPrompt(input),
  }).result;
}

export function resolveHealthMonitorDetail(
  monitor: HealthMonitorRecord,
  timeWindowOverride?: { label: string; startAt?: string; endAt?: string },
) {
  try {
    const input = buildMonitorDetailInput(monitor, timeWindowOverride);
    const prompt = buildMonitorDetailPrompt(input);
    const result = generateMonitorDetailResult(input);

    const aiChatPrompt =
      monitor.aiPrompt.trim().length > 0 ? truncateText(monitor.aiPrompt, 400) : result.aiChatPrompt;

    return {
      input,
      prompt,
      result: {
        ...result,
        aiChatPrompt,
      },
    };
  } catch (error) {
    console.error("[health-monitor] resolve detail failed:", error);
    return buildFallbackHealthMonitorDetail(monitor);
  }
}

function buildProblem(input: MonitorDetailInput) {
  const benchmark = input.benchmark;
  if (input.monitor.status === "risk" && benchmark) {
    const benchmarkDelta = benchmark.delta ? `，${benchmark.delta}` : "";
    return truncateText(`${input.monitor.label}已进入风险状态，当前${input.coreMetric.label}为 ${input.coreMetric.value}，相对${benchmark.label}${benchmarkDelta}，需要优先处理。`, 120);
  }
  if (input.monitor.status === "risk") {
    return truncateText(`${input.monitor.label}已进入风险状态，当前${input.coreMetric.label}为 ${input.coreMetric.value}，需要优先处理。`, 120);
  }
  if (input.monitor.status === "watch") {
    return truncateText(`${input.monitor.label}当前处于关注状态，${input.coreMetric.label}为 ${input.coreMetric.value}，建议继续跟进并准备处理动作。`, 120);
  }
  return truncateText(`${input.monitor.label}当前整体稳定，${input.coreMetric.label}为 ${input.coreMetric.value}，暂不属于优先处理问题。`, 120);
}

function buildAiChatPrompt(input: MonitorDetailInput) {
  const factLines = input.facts
    .slice(0, 3)
    .map((fact) => `- ${fact.label}: ${fact.value}`)
    .join("\n");

  const benchmark = input.benchmark;
  return [
    `请基于以下${input.monitor.label}监测结果继续分析。`,
    "",
    `问题：${buildProblem(input)}`,
    `关键数据：${input.coreMetric.label} ${input.coreMetric.value}`,
    benchmark
      ? `基准：${benchmark.label} ${benchmark.value}${benchmark.delta ? `（${benchmark.delta}）` : ""}`
      : "基准：当前没有可比基准口径，请不要假设达标线。",
    "证据：",
    factLines,
    "",
    "请输出下一步优先级排序的排查建议，并说明最可能的原因。",
  ].join("\n");
}

/**
 * 可比基准线只取监测项自身携带的真实基准。
 *
 * 这里刻意不再提供任何兜底常量：基准缺失时返回 null，页面不渲染基准卡。
 * 否则真实当前值会和写死的基准/差值同屏出现，得到互相矛盾的数字。
 */
function buildBenchmark(monitor: HealthMonitorRecord): MonitorDetailInput["benchmark"] {
  return monitor.benchmark ?? null;
}

function inferAffectedObjects(monitor: HealthMonitorRecord): MonitorDetailInput["affectedObjects"] {
  return monitor.evidence
    .filter((entry) => /页面|SKU|广告|订单|商品/.test(entry.value))
    .slice(0, 2)
    .map((entry) => ({
      type: inferObjectType(entry.value),
      name: entry.label,
      summary: entry.value,
    }));
}

function inferObjectType(value: string): z.infer<typeof objectTypeSchema> {
  if (value.includes("#")) return "order";
  if (value.includes("落地页")) return "landing_page";
  if (value.includes("页面")) return "page";
  if (value.includes("SKU")) return "sku";
  if (value.includes("广告")) return "campaign";
  return "other";
}

function inferSource(monitorId: string, label: string): z.infer<typeof sourceSchema> {
  if (monitorId === "page-performance") return "pagespeed";
  if (monitorId === "seo-health") return "gsc";
  if (monitorId === "traffic-health" || monitorId === "conversion-health") return "ga4";
  if (monitorId === "ads-health" || label.includes("ROI")) return "ads";
  if (monitorId === "inventory-health" || monitorId === "fulfillment-health" || monitorId === "pricing-health") {
    return "shopify";
  }
  return "internal";
}

function inferTimeWindowLabel(monitor: HealthMonitorRecord) {
  if (monitor.id === "page-performance") return "实时检测";
  if (monitor.id === "seo-health") return "近28天";
  if (monitor.id === "refund-health") return "近30天";
  return "近7天";
}

/** 显式 false 才是未接入；缺省视为走每日快照的真实指标。 */
function isDataAvailable(monitor: HealthMonitorRecord): boolean {
  return monitor.dataAvailable !== false;
}

/**
 * 数据质量按「是否真的有可用数据源」判定。
 *
 * 这里不能从状态反推（风险→中、正常→高）：那样只是把结论重新染色，
 * 会把未接入的占位项标成可信数据。
 */
function inferDataQuality(monitor: HealthMonitorRecord): z.infer<typeof scoringSchema> {
  return isDataAvailable(monitor) ? "high" : "low";
}

/** 结论可信度：有数据才谈可信；有明确基准可比时才给高。 */
function inferConfidence(monitor: HealthMonitorRecord): z.infer<typeof scoringSchema> {
  if (!isDataAvailable(monitor)) return "low";
  return monitor.benchmark ? "high" : "medium";
}

function inferDirection(status: HealthMonitorStatus): "up" | "down" | "flat" {
  if (status === "risk") return "down";
  if (status === "watch") return "down";
  return "flat";
}

function inferUnit(value: string) {
  if (value.includes("%")) return "%";
  if (value.includes("x")) return "x";
  if (value.includes("s")) return "s";
  if (value.includes("天")) return "天";
  return undefined;
}

function inferCoreMetricLabel(monitor: HealthMonitorRecord) {
  if (monitor.id === "page-performance") return "LCP";
  if (monitor.id === "seo-health") return "CTR";
  if (monitor.id === "payment-health") return "支付成功率";
  if (monitor.id === "roi-health") return "ROI";
  if (monitor.id === "revenue-health") return "收入增速";
  if (monitor.id === "traffic-health") return "Sessions";
  if (monitor.id === "ads-health") return "ROAS";
  if (monitor.id === "product-readiness-health") return "商品就绪度";
  if (monitor.id === "conversion-health") return "CVR";
  if (monitor.id === "refund-health") return "退款率";
  if (monitor.id === "inventory-health") return "库存安全天数";
  if (monitor.id === "fulfillment-health") return "超时单占比";
  if (monitor.id === "risk-control-health") return "风控状态";
  if (monitor.id === "pricing-health") return "毛利率";
  return monitor.title;
}

function buildRuleTrace(status: HealthMonitorStatus, label: string) {
  if (status === "risk") return `${label}明显偏离基准，标记为 risk。`;
  if (status === "watch") return `${label}接近风险边界，标记为 watch。`;
  return `${label}保持在健康区间，标记为 good。`;
}

function buildBenchmarkTrace(monitor: HealthMonitorRecord) {
  const benchmark = buildBenchmark(monitor);
  if (!benchmark) {
    return `当前值 ${monitor.value} 没有可比基准口径，因此只记录数值，不做达标判断。`;
  }
  return `当前值 ${monitor.value} 相对 ${benchmark.label} ${benchmark.value}，判断为 ${benchmark.direction}。`;
}

function toSnakeCase(value: string) {
  return value
    .replace(/[（）()]/g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildFallbackHealthMonitorDetail(monitor: HealthMonitorRecord): {
  input: MonitorDetailInput;
  prompt: ReturnType<typeof buildMonitorDetailPrompt>;
  result: MonitorDetailResult;
} {
  const input: MonitorDetailInput = {
    version: "v1",
    monitor: {
      id: monitor.id,
      name: monitor.id,
      group: monitor.group === "可信度健康" ? "site_health" : "business_health",
      label: monitor.title,
      status: monitor.status,
    },
    timeWindow: {
      label: inferTimeWindowLabel(monitor),
    },
    // 走到兜底说明正常装配已失败，可信度固定压到 low。
    scoring: {
      dataQuality: inferDataQuality(monitor),
      confidence: "low",
    },
    coreMetric: {
      label: inferCoreMetricLabel(monitor),
      value: monitor.value,
      unit: inferUnit(monitor.value),
      direction: inferDirection(monitor.status),
    },
    benchmark: buildBenchmark(monitor),
    facts: monitor.evidence.slice(0, 3).map((entry) => ({
      label: entry.label,
      value: entry.value,
      source: "internal" as const,
    })),
    possibleCauses: [monitor.summary],
    candidateActions: monitor.actions.slice(0, 3).map((action, index) => ({
      title: action.title,
      detail: action.detail,
      priority: index === 0 ? "P0" : index === 1 ? "P1" : "P2",
    })),
    generationTrace: {
      dataFacts: [monitor.value],
      rulesApplied: [buildRuleTrace(monitor.status, monitor.title)],
      benchmarkComparisons: [buildBenchmarkTrace(monitor)],
    },
  };

  return {
    input,
    prompt: buildMonitorDetailPrompt(input),
    result: {
      problem: truncateText(monitor.issue, 120),
      evidenceSummary: monitor.evidence.slice(0, 3).map((entry) => ({
        label: entry.label,
        summary: entry.value,
      })),
      actions: monitor.actions.slice(0, 3).map((action, index) => ({
        title: action.title,
        detail: action.detail,
        priority: index === 0 ? "P0" : index === 1 ? "P1" : "P2",
      })),
      aiChatPrompt: truncateText(monitor.aiPrompt, 400),
    },
  };
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
