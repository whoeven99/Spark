import { buildManagedAiPrompt, type ManagedAiPromptTemplate } from "./managedAiPrompt";
import type { TodayAnalysisCard, TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "./todayReportTypes";

export type TodayManagedPromptSceneKey =
  | "today.page.analysis"
  | "today.object.analysis"
  | "today.group.analysis"
  | "today.analysis.todo_refine";

export type TodayManagedPromptCatalogItem = {
  sceneKey: TodayManagedPromptSceneKey;
  title: string;
  contextSchemaKey: string;
  outputSchemaKey: string;
  objective: string;
};

type TodayPagePromptInput = {
  report: TodayDecisionReport;
};

type TodayObjectPromptInput = {
  report: TodayDecisionReport;
  objectCard: TodayObjectCard;
};

type TodayGroupPromptInput = {
  report: TodayDecisionReport;
  group: TodayEvidenceGroup;
};

type TodayAnalysisTodoPromptInput = {
  pageTitle: string;
  card: TodayAnalysisCard;
};

const TODAY_PROMPT_GUARDRAILS = [
  "只能使用上下文中已经提供的事实、指标和结论，不要编造新数据。",
  "先判断支撑项和拖累项，再给处理优先级，不要直接跳到泛泛建议。",
  "结论要尽量贴近经营结果和赚钱质量，不要输出空泛套话。",
];

const TODAY_PAGE_TEMPLATE: ManagedAiPromptTemplate<TodayPagePromptInput> = {
  registryKey: "today.page.analysis",
  contextSchemaKey: "today.decision-report.page.v1",
  outputSchemaKey: "today.page.analysis.reply.v1",
  role: "Spark 的 Today 经营分析助手",
  objective: "围绕一个 Today 报告页，继续判断最值得优先处理的经营问题。",
  output: [
    "先判断当前页面最主要的支撑项和拖累项。",
    "给出今天最优先的处理顺序，按先后列出。",
    "如果存在不确定性，要明确指出还缺哪一类证据。",
  ],
  guardrails: TODAY_PROMPT_GUARDRAILS,
  buildIntroLines: ({ report }) => [`我们正在查看 Today 的「${report.title}」报告页。`],
  buildContextBlocks: ({ report }) => [
    {
      key: "question",
      title: "页面问题",
      lines: [report.primaryQuestion],
    },
    {
      key: "summary",
      title: "页面摘要",
      lines: [report.summary],
    },
    {
      key: "metrics",
      title: "摘要指标",
      lines: report.summaryMetrics.slice(0, 4).map((metric) => `${metric.label}: ${metric.value}${metric.unit ? metric.unit : ""}`),
    },
    {
      key: "statuses",
      title: "当前判断",
      lines: report.statuses.map((status) => `${status.label}: ${status.detail}`),
    },
    {
      key: "actions",
      title: "建议动作",
      lines: report.actions.map((action) => `[${action.priority}] ${action.title}: ${action.detail}`),
    },
  ],
};

const TODAY_OBJECT_TEMPLATE: ManagedAiPromptTemplate<TodayObjectPromptInput> = {
  registryKey: "today.object.analysis",
  contextSchemaKey: "today.decision-report.object.v1",
  outputSchemaKey: "today.object.analysis.reply.v1",
  role: "Spark 的 Today 对象分析助手",
  objective: "围绕一个对象卡，判断它应该继续放大、先止损、还是继续观察。",
  output: [
    "先说明这个对象当前最关键的经营判断。",
    "给出对象级的优先处理顺序。",
    "如果需要继续下钻，要明确指出最值得看的下一层对象或证据。",
  ],
  guardrails: TODAY_PROMPT_GUARDRAILS,
  buildIntroLines: ({ report, objectCard }) => [
    `我们正在查看 Today 的「${report.title}」报告页中的对象「${objectCard.title}」。`,
    `对象类型：${objectCard.objectType}`,
  ],
  buildContextBlocks: ({ objectCard }) => [
    {
      key: "metrics",
      title: "对象指标",
      lines: objectCard.report.headlineMetrics
        .slice(0, 4)
        .map((metric) => `${metric.label}: ${metric.value}${metric.unit ? metric.unit : ""}`),
    },
    {
      key: "conclusion",
      title: "对象结论",
      lines: [objectCard.report.conclusion],
    },
    {
      key: "actions",
      title: "当前动作建议",
      lines:
        objectCard.report.actions.length > 0
          ? objectCard.report.actions.map((action) => `[${action.priority}] ${action.title}: ${action.detail}`)
          : ["当前对象还没有结构化动作建议。"],
    },
  ],
};

const TODAY_GROUP_TEMPLATE: ManagedAiPromptTemplate<TodayGroupPromptInput> = {
  registryKey: "today.group.analysis",
  contextSchemaKey: "today.decision-report.group.v1",
  outputSchemaKey: "today.group.analysis.reply.v1",
  role: "Spark 的 Today 对象组分析助手",
  objective: "围绕一组对象，判断谁更应该优先放大、止损或排查。",
  output: [
    "先判断这组对象的整体问题。",
    "列出最值得优先处理的对象顺序。",
    "说明每个优先对象背后的关键证据。",
  ],
  guardrails: TODAY_PROMPT_GUARDRAILS,
  buildIntroLines: ({ report, group }) => [`我们正在查看 Today 的「${report.title}」中的对象组「${group.title}」。`],
  buildContextBlocks: ({ group }) => [
    {
      key: "summary",
      title: "对象组判断",
      lines: [group.summary],
    },
    {
      key: "items",
      title: "对象样本",
      lines: group.items.slice(0, 5).map((item) => {
        const leadMetrics = item.metrics
          .slice(0, 2)
          .map((metric) => `${metric.label} ${metric.value}${metric.unit ? metric.unit : ""}`)
          .join(" / ");
        return `${item.title}: ${leadMetrics || item.summary}`;
      }),
    },
  ],
};

const TODAY_ANALYSIS_TODO_TEMPLATE: ManagedAiPromptTemplate<TodayAnalysisTodoPromptInput> = {
  registryKey: "today.analysis.todo_refine",
  contextSchemaKey: "today.analysis-card.v1",
  outputSchemaKey: "today.todo.refine.v1",
  role: "Spark 的 Today 经营动作助手",
  objective: "把分析卡的结论继续拆成今天就能执行的轻量 todo。",
  output: [
    "输出 3 条以内的 today todo。",
    "每条 todo 都要包含动作、对象、目标指标和优先级。",
    "todo 要足够轻，不要变成大型项目计划。",
  ],
  guardrails: [
    ...TODAY_PROMPT_GUARDRAILS,
    "todo 必须是今天能开始执行的动作，不要写长期战略口号。",
  ],
  buildIntroLines: ({ pageTitle, card }) => [
    `我们正在查看 Today 的「${pageTitle}」中的分析卡「${card.title}」。`,
  ],
  buildContextBlocks: ({ card }) => [
    {
      key: "question",
      title: "问题",
      lines: [card.question],
    },
    {
      key: "conclusion",
      title: "结论",
      lines: [card.conclusion],
    },
    {
      key: "evidence",
      title: "关键证据",
      lines:
        card.evidence.length > 0
          ? card.evidence.map((item) => `${item.label}: ${item.value}${item.change ? `（${item.change}）` : ""}`)
          : ["当前没有更多结构化证据。"],
    },
    {
      key: "ideas",
      title: "已有优化思路",
      lines: card.ideas.length > 0 ? card.ideas : ["当前还没有预置优化思路。"],
    },
  ],
};

const TODAY_MANAGED_PROMPT_CATALOG: TodayManagedPromptCatalogItem[] = [
  {
    sceneKey: "today.page.analysis",
    title: "Today 页面分析",
    contextSchemaKey: TODAY_PAGE_TEMPLATE.contextSchemaKey,
    outputSchemaKey: TODAY_PAGE_TEMPLATE.outputSchemaKey,
    objective: TODAY_PAGE_TEMPLATE.objective,
  },
  {
    sceneKey: "today.object.analysis",
    title: "Today 对象分析",
    contextSchemaKey: TODAY_OBJECT_TEMPLATE.contextSchemaKey,
    outputSchemaKey: TODAY_OBJECT_TEMPLATE.outputSchemaKey,
    objective: TODAY_OBJECT_TEMPLATE.objective,
  },
  {
    sceneKey: "today.group.analysis",
    title: "Today 对象组分析",
    contextSchemaKey: TODAY_GROUP_TEMPLATE.contextSchemaKey,
    outputSchemaKey: TODAY_GROUP_TEMPLATE.outputSchemaKey,
    objective: TODAY_GROUP_TEMPLATE.objective,
  },
  {
    sceneKey: "today.analysis.todo_refine",
    title: "Today 分析卡 Todo 细化",
    contextSchemaKey: TODAY_ANALYSIS_TODO_TEMPLATE.contextSchemaKey,
    outputSchemaKey: TODAY_ANALYSIS_TODO_TEMPLATE.outputSchemaKey,
    objective: TODAY_ANALYSIS_TODO_TEMPLATE.objective,
  },
];

export function listTodayManagedPromptCatalog(): TodayManagedPromptCatalogItem[] {
  return TODAY_MANAGED_PROMPT_CATALOG;
}

export function getTodayManagedPromptCatalogItem(sceneKey: TodayManagedPromptSceneKey): TodayManagedPromptCatalogItem | null {
  return TODAY_MANAGED_PROMPT_CATALOG.find((item) => item.sceneKey === sceneKey) ?? null;
}

export function buildTodayPageManagedPrompt(report: TodayDecisionReport) {
  return buildManagedAiPrompt(TODAY_PAGE_TEMPLATE, { report });
}

export function buildTodayObjectManagedPrompt(report: TodayDecisionReport, objectCard: TodayObjectCard) {
  return buildManagedAiPrompt(TODAY_OBJECT_TEMPLATE, { report, objectCard });
}

export function buildTodayGroupManagedPrompt(report: TodayDecisionReport, group: TodayEvidenceGroup) {
  return buildManagedAiPrompt(TODAY_GROUP_TEMPLATE, { report, group });
}

export function buildTodayAnalysisTodoManagedPrompt(pageTitle: string, card: TodayAnalysisCard) {
  return buildManagedAiPrompt(TODAY_ANALYSIS_TODO_TEMPLATE, { pageTitle, card });
}
