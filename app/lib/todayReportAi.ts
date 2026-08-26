import {
  aiDrilldownContextSchema,
  type AiDrilldownContext,
} from "./aiDrilldownContext";
import {
  buildTodayAnalysisTodoManagedPrompt,
  buildTodayGroupManagedPrompt,
  buildTodayObjectManagedPrompt,
  buildTodayPageManagedPrompt,
} from "./todayAiPromptRegistry";
import type { TodayAnalysisCard, TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "./todayReportTypes";

export function buildTodayPageAiDrilldownContext(report: TodayDecisionReport): AiDrilldownContext {
  const managedPrompt = buildTodayPageManagedPrompt(report);
  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: report.key,
    promptRegistryKey: managedPrompt.spec.registryKey,
    promptContextSchemaKey: managedPrompt.spec.contextSchemaKey,
    promptOutputSchemaKey: managedPrompt.spec.outputSchemaKey,
    title: report.title,
    summary: report.summary,
    primaryQuestion: report.primaryQuestion,
    metrics: report.summaryMetrics.slice(0, 6),
    statuses: report.statuses,
    suggestedActions: report.actions,
    chatPrompt: managedPrompt.chatPrompt,
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
  const managedPrompt = buildTodayObjectManagedPrompt(report, objectCard);
  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: `${report.key}:${objectCard.objectType}:${objectCard.id}`,
    promptRegistryKey: managedPrompt.spec.registryKey,
    promptContextSchemaKey: managedPrompt.spec.contextSchemaKey,
    promptOutputSchemaKey: managedPrompt.spec.outputSchemaKey,
    title: objectReport.title,
    summary: objectReport.conclusion,
    primaryQuestion: `${report.title} 中「${objectCard.title}」下一步最值得先处理什么？`,
    metrics: objectReport.headlineMetrics.slice(0, 6),
    statuses: report.statuses.slice(0, 3),
    suggestedActions: objectActions,
    chatPrompt: managedPrompt.chatPrompt,
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
  const managedPrompt = buildTodayGroupManagedPrompt(report, group);

  const context: AiDrilldownContext = {
    version: "v1",
    contextType: "today",
    pageKey: `${report.key}:group:${group.key}`,
    promptRegistryKey: managedPrompt.spec.registryKey,
    promptContextSchemaKey: managedPrompt.spec.contextSchemaKey,
    promptOutputSchemaKey: managedPrompt.spec.outputSchemaKey,
    title: group.title,
    summary: group.summary,
    primaryQuestion: `${report.title} 中「${group.title}」这组对象应该先处理谁？`,
    metrics: metrics.length > 0 ? metrics : report.summaryMetrics.slice(0, 3),
    statuses: report.statuses.slice(0, 3),
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : report.actions,
    chatPrompt: managedPrompt.chatPrompt,
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

export function buildTodayAnalysisTodoRefinePrompt(pageTitle: string, card: TodayAnalysisCard) {
  return buildTodayAnalysisTodoManagedPrompt(pageTitle, card);
}
