import { TODAY_ALL_COUNTRIES } from "./todayGeo.shared";
import type { TranslateFn } from "./i18nText";
import type {
  TodayAnalysisCard,
  TodayAnalysisOverviewCard,
  TodayAnalysisPageReport,
  TodayAnalysisTodo,
  TodayBreakdownBlock,
  TodayDecisionReport,
  TodayEvidenceGroup,
  TodayHeader,
  TodayMetricCard,
  TodayOverviewReport,
  TodayReasonCard,
  TodayRoiSummaryCard,
} from "./todayReportTypes";

export function tx(
  t: TranslateFn,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  return String(t(key, { defaultValue: fallback, ...params }));
}

export function localizeTodayHeader(header: TodayHeader, t: TranslateFn): TodayHeader {
  if (header.copySource === "fallback") {
    return {
      ...header,
      statusLabel: tx(t, "today.header.fallback.statusLabel", header.statusLabel),
      summary: tx(t, "today.header.fallback.summary", header.summary),
      primaryBottleneck: tx(t, "today.header.fallback.bottleneck", header.primaryBottleneck),
      biggestOpportunity: tx(t, "today.header.fallback.opportunity", header.biggestOpportunity),
      dataFreshness: tx(t, "today.header.fallback.dataFreshness", header.dataFreshness),
    };
  }

  return {
    ...header,
    statusLabel: tx(t, `today.header.status.${header.status}`, header.statusLabel),
    summary: tx(t, `today.header.summary.${header.status}`, header.summary),
    primaryBottleneck: tx(
      t,
      `today.header.bottleneck.${header.bottleneckKey ?? "profitLag"}`,
      header.primaryBottleneck,
    ),
    biggestOpportunity: tx(
      t,
      `today.header.opportunity.${header.opportunityKey ?? "newOrders"}`,
      header.biggestOpportunity,
    ),
    dataFreshness: tx(t, "today.header.dataFreshness", header.dataFreshness),
  };
}

export function localizeMetricCard(card: TodayMetricCard, t: TranslateFn): TodayMetricCard {
  return {
    ...card,
    label: tx(t, `today.metricCards.${card.key}.label`, card.label),
    summary: card.summary
      ? tx(t, `today.metricCards.${card.key}.summary`, card.summary)
      : card.summary,
  };
}

export function localizeReasonCard(card: TodayReasonCard, t: TranslateFn): TodayReasonCard {
  const variant = card.variant ? `.${card.variant}` : "";
  const translateMeta = card.key === "profit-erosion" || card.variant === "fallback";
  return {
    ...card,
    title: tx(t, `today.reasonCards.${card.key}.title`, card.title),
    label: tx(t, `today.reasonCards.${card.key}.label${variant}`, card.label),
    summary: tx(t, `today.reasonCards.${card.key}.summary${variant}`, card.summary),
    meta: translateMeta
      ? tx(t, `today.reasonCards.${card.key}.meta${variant}`, card.meta)
      : card.meta,
  };
}

export function localizeRoiCard(card: TodayRoiSummaryCard, t: TranslateFn): TodayRoiSummaryCard {
  return {
    ...card,
    label: tx(t, `today.roiCards.${card.key}.label`, card.label),
    summary: tx(t, `today.roiCards.${card.key}.summary`, card.summary),
    statusLabel: card.statusKey
      ? tx(t, `today.roiCards.status.${card.statusKey}`, card.statusLabel)
      : card.statusLabel,
  };
}

export function localizeTodayOverviewReport(
  report: TodayOverviewReport,
  t: TranslateFn,
): TodayOverviewReport {
  return {
    header: localizeTodayHeader(report.header, t),
    metricCards: report.metricCards.map((card) => localizeMetricCard(card, t)),
    reasonCards: report.reasonCards.map((card) => localizeReasonCard(card, t)),
    roiSummary: {
      cards: report.roiSummary.cards.map((card) => localizeRoiCard(card, t)),
    },
  };
}

export function localizeAnalysisTodo(
  todo: TodayAnalysisTodo,
  t: TranslateFn,
  cardKey: string,
): TodayAnalysisTodo {
  if (todo.actionType === "open_assistant") {
    return {
      ...todo,
      title: tx(t, `today.analysisCards.${cardKey}.assistantTitle`, todo.title),
      detail: tx(t, `today.analysisCards.${cardKey}.assistantDetail`, todo.detail),
      actionLabel: tx(t, "today.analysis.refineAction", todo.actionLabel),
    };
  }

  return {
    ...todo,
    title: tx(t, `today.analysisTodos.${todo.key}.title`, todo.title),
    detail: tx(t, `today.analysisTodos.${todo.key}.detail`, todo.detail),
    actionLabel: tx(t, `today.analysisTodos.${todo.key}.action`, todo.actionLabel),
  };
}

export function localizeAnalysisCard(card: TodayAnalysisCard, t: TranslateFn): TodayAnalysisCard {
  return {
    ...card,
    title: tx(t, `today.analysisCards.${card.key}.title`, card.title),
    question: tx(t, `today.analysisCards.${card.key}.question`, card.question),
    conclusion: tx(t, `today.analysisCards.${card.key}.conclusion`, card.conclusion),
    metricLabel: tx(t, `today.analysisCards.${card.key}.metricLabel`, card.metricLabel),
    ideas: card.ideas.map((idea, index) =>
      tx(t, `today.analysisCards.${card.key}.idea${index + 1}`, idea),
    ),
    evidence: card.evidence.map((item, index) => ({
      ...item,
      label: tx(t, `today.analysisCards.${card.key}.evidence${index + 1}Label`, item.label),
    })),
    todos: card.todos.map((todo) => localizeAnalysisTodo(todo, t, card.key)),
  };
}

export function localizeAnalysisPage(
  page: TodayAnalysisPageReport,
  t: TranslateFn,
): TodayAnalysisPageReport {
  return {
    ...page,
    title: tx(t, `today.topics.${topicTitleKey(page.key)}`, page.title),
    subtitle: tx(t, `today.topics.${topicSubtitleKey(page.key)}`, page.subtitle),
    summary: tx(t, `today.topics.${topicSummaryKey(page.key)}`, page.summary),
    principles: page.principles.map((line, index) =>
      tx(t, `today.analysisPages.${page.key}.principle${index + 1}`, line),
    ),
    cards: page.cards.map((card) => localizeAnalysisCard(card, t)),
  };
}

export function localizeAnalysisOverviewCard(
  card: TodayAnalysisOverviewCard,
  t: TranslateFn,
): TodayAnalysisOverviewCard {
  const leadKey = overviewLeadCardKey(card.key);
  return {
    ...card,
    title: tx(t, `today.topics.${topicTitleKey(card.key)}`, card.title),
    question: tx(t, `today.analysisCards.${leadKey}.question`, card.question),
    conclusion: tx(t, `today.analysisCards.${leadKey}.conclusion`, card.conclusion),
    metricLabel: tx(t, `today.analysisCards.${leadKey}.metricLabel`, card.metricLabel),
  };
}

export function localizeCountryOption<T extends { key: string; label: string }>(
  option: T,
  t: TranslateFn,
): T {
  if (option.key !== TODAY_ALL_COUNTRIES) return option;
  return { ...option, label: tx(t, "today.filters.allCountries", option.label) };
}

export function localizeCountryOptions<T extends { key: string; label: string }>(
  options: T[],
  t: TranslateFn,
): T[] {
  return options.map((item) => localizeCountryOption(item, t));
}

export function localizeSelectedCountryLabel(
  selectedKey: string,
  selectedLabel: string,
  t: TranslateFn,
): string {
  if (selectedKey !== TODAY_ALL_COUNTRIES) return selectedLabel;
  return tx(t, "today.filters.allCountries", selectedLabel);
}

export function localizeDecisionReport(
  report: TodayDecisionReport,
  t: TranslateFn,
  countryLabel?: string,
): TodayDecisionReport {
  const scope = report.copyKey ?? report.key;
  const country = countryLabel?.trim() || extractCountryLabel(report);
  return {
    ...report,
    title: tx(t, `today.decision.${scope}.title`, report.title),
    subtitle: tx(t, `today.decision.${scope}.subtitle`, report.subtitle, { country }),
    accent: tx(t, `today.decision.${scope}.accent`, report.accent, { country }),
    primaryQuestion: tx(t, `today.decision.${scope}.primaryQuestion`, report.primaryQuestion),
    groups: report.groups.map((group) => localizeEvidenceGroup(group, t)),
    supplementaryGroups: report.supplementaryGroups?.map((group) => localizeEvidenceGroup(group, t)),
    breakdowns: report.breakdowns.map((block) => localizeBreakdown(block, t)),
  };
}

function localizeEvidenceGroup(group: TodayEvidenceGroup, t: TranslateFn): TodayEvidenceGroup {
  const key = group.copyKey ?? group.key;
  return {
    ...group,
    title: tx(t, `today.groups.${key}.title`, group.title),
    summary: tx(t, `today.groups.${key}.summary`, group.summary),
  };
}

function localizeBreakdown(block: TodayBreakdownBlock, t: TranslateFn): TodayBreakdownBlock {
  const key = block.copyKey ?? block.key;
  return {
    ...block,
    title: tx(t, `today.breakdowns.${key}.title`, block.title),
    summary: tx(t, `today.breakdowns.${key}.summary`, block.summary),
  };
}

function extractCountryLabel(report: TodayDecisionReport): string {
  const accent = report.accent.trim();
  if (accent.includes(" / ")) return accent.split(" / ")[0] ?? accent;
  return accent;
}

function topicTitleKey(key: TodayAnalysisPageReport["key"]) {
  switch (key) {
    case "after_sales":
      return "afterSalesTitle";
    case "customer_value":
      return "customerValueTitle";
    case "product":
      return "productTitle";
    case "ads":
      return "adsTitle";
    case "orders":
      return "ordersTitle";
  }
}

function topicSubtitleKey(key: TodayAnalysisPageReport["key"]) {
  switch (key) {
    case "after_sales":
      return "afterSalesSubtitle";
    case "customer_value":
      return "customerValueSubtitle";
    case "product":
      return "productSubtitle";
    case "ads":
      return "adsSubtitle";
    case "orders":
      return "ordersSubtitle";
  }
}

function topicSummaryKey(key: TodayAnalysisPageReport["key"]) {
  switch (key) {
    case "after_sales":
      return "afterSalesSummary";
    case "customer_value":
      return "customerValueSummary";
    case "product":
      return "productSummary";
    case "ads":
      return "adsSummary";
    case "orders":
      return "ordersSummary";
  }
}

function overviewLeadCardKey(key: TodayAnalysisOverviewCard["key"]): string {
  switch (key) {
    case "product":
      return "pricing";
    case "ads":
      return "channel-roi";
    case "orders":
      return "order-scale";
    case "after_sales":
      return "refund-risk";
    case "customer_value":
      return "quality-segmentation";
  }
}
