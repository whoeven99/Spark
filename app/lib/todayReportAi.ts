import {
  aiDrilldownContextSchema,
  type AiDrilldownContext,
} from "./aiDrilldownContext";
import type { TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "./todayReportTypes";

export function buildTodayPageAiDrilldownContext(report: TodayDecisionReport): AiDrilldownContext {
  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: report.key,
    title: report.title,
    summary: report.summary,
    primaryQuestion: report.primaryQuestion,
    metrics: report.summaryMetrics.slice(0, 6),
    statuses: report.statuses,
    suggestedActions: report.actions,
    chatPrompt: buildTodayPageAiChatPrompt(report),
  };

  const parsed = aiDrilldownContextSchema.safeParse(context);
  if (parsed.success) return parsed.data;

  console.error("[today-report] invalid page AI drilldown context:", parsed.error.flatten());
  return {
    ...context,
    metrics: report.summaryMetrics.slice(0, 3),
  };
}

export function buildTodayObjectAiDrilldownContext(
  report: TodayDecisionReport,
  objectCard: TodayObjectCard,
): AiDrilldownContext {
  const objectReport = objectCard.report;
  const objectActions = objectReport.actions.length > 0 ? objectReport.actions : report.actions;
  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: `${report.key}:${objectCard.objectType}:${objectCard.id}`,
    title: objectReport.title,
    summary: objectReport.conclusion,
    primaryQuestion: `${report.title} 中「${objectCard.title}」下一步最值得先处理什么？`,
    metrics: objectReport.headlineMetrics.slice(0, 6),
    statuses: report.statuses.slice(0, 3),
    suggestedActions: objectActions,
    chatPrompt: buildTodayObjectAiChatPrompt(report, objectCard),
  };

  const parsed = aiDrilldownContextSchema.safeParse(context);
  if (parsed.success) return parsed.data;

  console.error("[today-report] invalid object AI drilldown context:", parsed.error.flatten());
  return {
    ...context,
    metrics: objectReport.headlineMetrics.slice(0, 3),
  };
}

export function buildTodayGroupAiDrilldownContext(
  report: TodayDecisionReport,
  group: TodayEvidenceGroup,
): AiDrilldownContext {
  const sampleItems = group.items.slice(0, 4);
  const metrics = sampleItems.flatMap((item) => item.metrics.slice(0, 1)).slice(0, 6);
  const suggestedActions =
    sampleItems
      .flatMap((item) => item.report.actions.slice(0, 1))
      .slice(0, 3) || report.actions;

  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: `${report.key}:group:${group.key}`,
    title: group.title,
    summary: group.summary,
    primaryQuestion: `${report.title} 中「${group.title}」这组对象应该先处理谁？`,
    metrics: metrics.length > 0 ? metrics : report.summaryMetrics.slice(0, 3),
    statuses: report.statuses.slice(0, 3),
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : report.actions,
    chatPrompt: buildTodayGroupAiChatPrompt(report, group),
  };

  const parsed = aiDrilldownContextSchema.safeParse(context);
  if (parsed.success) return parsed.data;

  console.error("[today-report] invalid group AI drilldown context:", parsed.error.flatten());
  return {
    ...context,
    metrics: (metrics.length > 0 ? metrics : report.summaryMetrics).slice(0, 3),
    suggestedActions: (suggestedActions.length > 0 ? suggestedActions : report.actions).slice(0, 2),
  };
}

function buildTodayPageAiChatPrompt(report: TodayDecisionReport): string {
  const metricLines = report.summaryMetrics
    .slice(0, 4)
    .map((metric) => `- ${metric.label}: ${metric.value}${metric.unit ? metric.unit : ""}`)
    .join("\n");
  const statusLines = report.statuses.map((item) => `- ${item.label}: ${item.detail}`).join("\n");
  const actionLines = report.actions
    .map((action) => `- [${action.priority}] ${action.title}: ${action.detail}`)
    .join("\n");

  return [
    `我们正在查看 Today 的「${report.title}」报告页。`,
    `页面问题：${report.primaryQuestion}`,
    "",
    "摘要指标：",
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

function buildTodayObjectAiChatPrompt(report: TodayDecisionReport, objectCard: TodayObjectCard): string {
  const objectReport = objectCard.report;
  const metricLines = objectReport.headlineMetrics
    .slice(0, 4)
    .map((metric) => `- ${metric.label}: ${metric.value}${metric.unit ? metric.unit : ""}`)
    .join("\n");
  const actionLines = objectReport.actions
    .map((action) => `- [${action.priority}] ${action.title}: ${action.detail}`)
    .join("\n");

  return [
    `我们正在查看 Today 的「${report.title}」报告页中的对象「${objectCard.title}」。`,
    `对象类型：${objectCard.objectType}`,
    "",
    "对象指标：",
    metricLines,
    "",
    `对象结论：${objectReport.conclusion}`,
    "",
    "当前动作建议：",
    actionLines,
    "",
    "请围绕赚钱结果继续分析：判断这个对象是应该继续放大、先止损、还是继续观察，并给出今天最优先的处理顺序。",
  ].join("\n");
}

function buildTodayGroupAiChatPrompt(report: TodayDecisionReport, group: TodayEvidenceGroup): string {
  const sampleItems = group.items.slice(0, 5);
  const itemLines = sampleItems
    .map((item) => {
      const leadMetrics = item.metrics
        .slice(0, 2)
        .map((metric) => `${metric.label} ${metric.value}${metric.unit ? metric.unit : ""}`)
        .join(" / ");
      return `- ${item.title}: ${leadMetrics || item.summary}`;
    })
    .join("\n");

  return [
    `我们正在查看 Today 的「${report.title}」报告页中的对象组「${group.title}」。`,
    `对象组判断：${group.summary}`,
    "",
    "当前对象样本：",
    itemLines,
    "",
    "请围绕赚钱结果继续分析：判断这组对象里哪些应该优先放大，哪些应该先止损或排查，并给出今天最优先的处理顺序。",
  ].join("\n");
}
