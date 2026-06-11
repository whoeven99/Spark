import prisma from "../../db.server";
import {
  computeOperationsDiagnosis,
  type DiagnosisItemResult,
  type OperationsSummaryMetrics,
} from "./diagnosis.server";
import {
  dueWindowToDate,
  evaluateDiagnosisRules,
  type TaskDueWindow,
  type TaskPriority,
  type TaskQuadrant,
} from "./diagnosisRules.server";

/**
 * 每日巡检服务：生成/读取当日诊断快照，同步四象限待办任务，输出昨日复盘。
 *
 * 触发方式为「懒巡检」：当天首个访问触发计算，后续访问直接读快照；
 * 后续可平滑切换为定时器调用 ensureDailySnapshot。
 */

const IGNORED_SUPPRESS_DAYS = 7;
/** open 任务超过该天数未处理自动标记过期关闭，避免列表无限堆积 */
const STALE_TASK_AUTO_CLOSE_DAYS = 14;

export type OperationTaskView = {
  id: string;
  sourceKey: string;
  title: string;
  quadrant: TaskQuadrant;
  priority: TaskPriority;
  status: string;
  triggerReason: string;
  relatedObjects: unknown;
  suggestedActions: string[];
  ownerRole: string | null;
  dueWindow: TaskDueWindow;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type DailyReviewDelta = {
  key: string;
  label: string;
  previous: number;
  current: number;
  /** true=改善 false=恶化 null=持平 */
  improved: boolean | null;
};

export type DailyReview = {
  previousDate: string;
  deltas: DailyReviewDelta[];
  resolvedTaskCount: number;
};

export type DailyOperationsResult = {
  shop: string;
  snapshotDate: string;
  generatedAt: string;
  hasData: boolean;
  metrics: OperationsSummaryMetrics;
  items: DiagnosisItemResult[];
  tasks: OperationTaskView[];
  review: DailyReview | null;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toTaskView(task: {
  id: string;
  sourceKey: string;
  title: string;
  quadrant: string;
  priority: string;
  status: string;
  triggerReason: string;
  relatedObjects: unknown;
  suggestedActions: unknown;
  ownerRole: string | null;
  dueWindow: string;
  dueAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): OperationTaskView {
  return {
    id: task.id,
    sourceKey: task.sourceKey,
    title: task.title,
    quadrant: task.quadrant as TaskQuadrant,
    priority: task.priority as TaskPriority,
    status: task.status,
    triggerReason: task.triggerReason,
    relatedObjects: task.relatedObjects,
    suggestedActions: Array.isArray(task.suggestedActions)
      ? (task.suggestedActions as string[])
      : [],
    ownerRole: task.ownerRole,
    dueWindow: task.dueWindow as TaskDueWindow,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    resolvedAt: task.resolvedAt?.toISOString() ?? null,
  };
}

function toItemResult(item: {
  key: string;
  name: string;
  status: string;
  metrics: unknown;
  evidence: unknown;
  reasoning: unknown;
  formulas: unknown;
}): DiagnosisItemResult {
  return {
    key: item.key as DiagnosisItemResult["key"],
    name: item.name,
    status: item.status as DiagnosisItemResult["status"],
    metrics: (item.metrics ?? {}) as DiagnosisItemResult["metrics"],
    evidence: Array.isArray(item.evidence) ? (item.evidence as string[]) : [],
    reasoning: Array.isArray(item.reasoning) ? (item.reasoning as string[]) : [],
    formulas: Array.isArray(item.formulas) ? (item.formulas as string[]) : [],
  };
}

/** 复盘对比的指标口径（数值越小越好 / 越大越好）。 */
const REVIEW_METRICS: Array<{
  key: keyof OperationsSummaryMetrics;
  label: string;
  lowerIsBetter: boolean;
}> = [
  { key: "overdueOrderCount", label: "超时未发货订单", lowerIsBetter: true },
  { key: "carrierIssueCount", label: "物流异常单", lowerIsBetter: true },
  { key: "refundRate30d", label: "30 天退款率(%)", lowerIsBetter: true },
  { key: "riskSkuCount", label: "高风险库存 SKU", lowerIsBetter: true },
  { key: "salesAmount7d", label: "近 7 天销售额", lowerIsBetter: false },
];

async function buildReview(
  shop: string,
  todayMetrics: OperationsSummaryMetrics,
  now: Date,
): Promise<DailyReview | null> {
  const previous = await prisma.operationDiagnosisSnapshot.findFirst({
    where: { shop, snapshotDate: { lt: toDateKey(now) }, hasData: true },
    orderBy: { snapshotDate: "desc" },
  });
  if (!previous) return null;
  const prevMetrics = previous.metrics as Record<string, number | string | null>;

  const deltas: DailyReviewDelta[] = [];
  for (const spec of REVIEW_METRICS) {
    const prevValue = Number(prevMetrics[spec.key] ?? 0);
    const currentValue = Number(todayMetrics[spec.key] ?? 0);
    if (!Number.isFinite(prevValue) || !Number.isFinite(currentValue)) continue;
    deltas.push({
      key: spec.key,
      label: spec.label,
      previous: prevValue,
      current: currentValue,
      improved:
        currentValue === prevValue
          ? null
          : spec.lowerIsBetter
            ? currentValue < prevValue
            : currentValue > prevValue,
    });
  }

  const previousDayStart = new Date(`${previous.snapshotDate}T00:00:00.000Z`);
  const resolvedTaskCount = await prisma.operationTask.count({
    where: {
      shop,
      status: { in: ["done", "auto_closed"] },
      resolvedAt: { gte: previousDayStart },
    },
  });

  return { previousDate: previous.snapshotDate, deltas, resolvedTaskCount };
}

/**
 * 将规则评估结果同步到 OperationTask 表：
 * - 已存在同 dedupeKey 的 open/in_progress 任务 → 刷新内容（保留状态与创建时间）
 * - 近 7 天被用户忽略过的同类任务 → 跳过，不重复打扰
 * - 条件已消失的 open 任务 → 自动关闭（auto_closed）
 */
async function syncTasks(
  shop: string,
  snapshotId: string,
  generated: ReturnType<typeof evaluateDiagnosisRules>,
  now: Date,
): Promise<void> {
  const generatedKeys = new Set(generated.map((t) => t.dedupeKey));
  const activeTasks = await prisma.operationTask.findMany({
    where: { shop, status: { in: ["open", "in_progress"] } },
  });
  const activeByDedupe = new Map(activeTasks.map((t) => [t.dedupeKey, t]));

  const ignoredSince = new Date(
    now.getTime() - IGNORED_SUPPRESS_DAYS * 24 * 60 * 60 * 1000,
  );
  const recentlyIgnored = await prisma.operationTask.findMany({
    where: { shop, status: "ignored", updatedAt: { gte: ignoredSince } },
    select: { dedupeKey: true },
  });
  const ignoredKeys = new Set(recentlyIgnored.map((t) => t.dedupeKey));

  for (const task of generated) {
    const existing = activeByDedupe.get(task.dedupeKey);
    if (existing) {
      await prisma.operationTask.update({
        where: { id: existing.id },
        data: {
          snapshotId,
          title: task.title,
          quadrant: task.quadrant,
          priority: task.priority,
          triggerReason: task.triggerReason,
          relatedObjects: task.relatedObjects as object,
          suggestedActions: task.suggestedActions,
          ownerRole: task.ownerRole,
          dueWindow: task.dueWindow,
        },
      });
      continue;
    }
    if (ignoredKeys.has(task.dedupeKey)) continue;
    await prisma.operationTask.create({
      data: {
        shop,
        snapshotId,
        sourceKey: task.sourceKey,
        dedupeKey: task.dedupeKey,
        title: task.title,
        quadrant: task.quadrant,
        priority: task.priority,
        status: "open",
        triggerReason: task.triggerReason,
        relatedObjects: task.relatedObjects as object,
        suggestedActions: task.suggestedActions,
        ownerRole: task.ownerRole,
        dueWindow: task.dueWindow,
        dueAt: dueWindowToDate(task.dueWindow, now),
      },
    });
  }

  // 条件已消失或长期未处理的任务自动关闭
  const staleBefore = new Date(
    now.getTime() - STALE_TASK_AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000,
  );
  for (const task of activeTasks) {
    const conditionGone = !generatedKeys.has(task.dedupeKey);
    const tooOld = task.createdAt < staleBefore;
    if (conditionGone || (tooOld && task.status === "open")) {
      await prisma.operationTask.update({
        where: { id: task.id },
        data: { status: "auto_closed", resolvedAt: now },
      });
    }
  }
}

/**
 * 确保当日快照存在并返回完整结果（懒巡检入口）。
 * force=true 时重算当日快照（用于手动刷新）。
 */
export async function ensureDailySnapshot(
  shop: string,
  options?: { force?: boolean; now?: Date },
): Promise<DailyOperationsResult> {
  const now = options?.now ?? new Date();
  const dateKey = toDateKey(now);

  const existing = await prisma.operationDiagnosisSnapshot.findUnique({
    where: { shop_snapshotDate: { shop, snapshotDate: dateKey } },
    include: { items: true },
  });

  if (existing && !options?.force) {
    const [tasks, review] = await Promise.all([
      listOperationTasks(shop),
      buildReview(shop, existing.metrics as OperationsSummaryMetrics, now),
    ]);
    return {
      shop,
      snapshotDate: existing.snapshotDate,
      generatedAt: existing.generatedAt.toISOString(),
      hasData: existing.hasData,
      metrics: existing.metrics as OperationsSummaryMetrics,
      items: existing.items.map(toItemResult),
      tasks,
      review,
    };
  }

  const diagnosis = await computeOperationsDiagnosis(shop, now);

  if (existing) {
    // force 重算：级联删除旧诊断项，任务保留（snapshotId 置空后重新挂接）
    await prisma.operationDiagnosisSnapshot.delete({ where: { id: existing.id } });
  }

  const snapshot = await prisma.operationDiagnosisSnapshot.create({
    data: {
      shop,
      snapshotDate: dateKey,
      hasData: diagnosis.hasData,
      metrics: diagnosis.summaryMetrics,
      items: {
        create: diagnosis.items.map((item) => ({
          shop,
          key: item.key,
          name: item.name,
          status: item.status,
          metrics: item.metrics,
          evidence: item.evidence,
          reasoning: item.reasoning,
          formulas: item.formulas,
        })),
      },
    },
  });

  const generated = evaluateDiagnosisRules(diagnosis);
  await syncTasks(shop, snapshot.id, generated, now);

  const [tasks, review] = await Promise.all([
    listOperationTasks(shop),
    buildReview(shop, diagnosis.summaryMetrics, now),
  ]);

  return {
    shop,
    snapshotDate: dateKey,
    generatedAt: now.toISOString(),
    hasData: diagnosis.hasData,
    metrics: diagnosis.summaryMetrics,
    items: diagnosis.items,
    tasks,
    review,
  };
}

/** 当前任务列表：进行中的全部 + 近 3 天已关闭的（供页面展示处理痕迹）。 */
export async function listOperationTasks(
  shop: string,
  now: Date = new Date(),
): Promise<OperationTaskView[]> {
  const recentClosedSince = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const tasks = await prisma.operationTask.findMany({
    where: {
      shop,
      OR: [
        { status: { in: ["open", "in_progress"] } },
        {
          status: { in: ["done", "ignored", "auto_closed"] },
          updatedAt: { gte: recentClosedSince },
        },
      ],
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return tasks.map(toTaskView);
}

export type OperationTaskAction = "start" | "done" | "ignore" | "reopen";

const TASK_ACTION_TO_STATUS: Record<OperationTaskAction, string> = {
  start: "in_progress",
  done: "done",
  ignore: "ignored",
  reopen: "open",
};

/** 页面任务操作入口（带店铺归属校验）。 */
export async function updateOperationTaskStatus(
  shop: string,
  taskId: string,
  action: OperationTaskAction,
): Promise<OperationTaskView | null> {
  const task = await prisma.operationTask.findUnique({ where: { id: taskId } });
  if (!task || task.shop !== shop) return null;
  const status = TASK_ACTION_TO_STATUS[action];
  const updated = await prisma.operationTask.update({
    where: { id: taskId },
    data: {
      status,
      resolvedAt: action === "done" ? new Date() : action === "reopen" ? null : task.resolvedAt,
    },
  });
  return toTaskView(updated);
}
