import {
  aiDrilldownContextSchema,
  type AiDrilldownContext,
} from "./aiDrilldownContext";
import type { TodayMetricDetail } from "./todayMetricModules";

export function buildTodayAiDrilldownContext(detail: TodayMetricDetail): AiDrilldownContext {
  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: detail.key,
    title: detail.title,
    summary: detail.conclusions[0] ?? detail.intro,
    primaryQuestion: detail.primaryQuestion,
    metrics: detail.metrics.slice(0, 6),
    statuses: detail.statuses,
    suggestedActions: detail.actions,
    chatPrompt: buildTodayAiChatPrompt(detail),
  };

  const parsed = aiDrilldownContextSchema.safeParse(context);
  if (parsed.success) return parsed.data;

  console.error("[today-metric] invalid AI drilldown context:", parsed.error.flatten());
  return {
    ...context,
    summary: detail.intro,
    metrics: detail.metrics.slice(0, 3),
  };
}

export function buildTodayAiChatPrompt(detail: TodayMetricDetail): string {
  const metricLines = detail.metrics
    .slice(0, 4)
    .map((metric) => `- ${metric.label}: ${metric.value}${metric.unit ? metric.unit : ""}`)
    .join("\n");
  const statusLines = detail.statuses
    .map((item) => `- ${item.label}: ${item.detail}`)
    .join("\n");
  const actionLines = detail.actions
    .map((action) => `- [${action.priority}] ${action.title}: ${action.detail}`)
    .join("\n");

  return [
    `我们正在查看 Today 的「${detail.title}」详情页。`,
    `页面问题：${detail.primaryQuestion}`,
    "",
    "关键指标：",
    metricLines,
    "",
    "当前判断：",
    statusLines,
    "",
    "建议动作：",
    actionLines,
    "",
    "请围绕赚钱结果继续分析：先判断最主要的支撑项和拖累项，再给出今天优先级最高的处理顺序。",
  ].join("\n");
}
