/**
 * TaskRunPayload — 「任务已开始」对话卡片的载荷。
 *
 * TaskProposal 确认执行成功后，工作台会向对话追加一轮交互：
 * 用户侧「开始执行：xxx」+ 助手侧带 TaskRunChatCard 的回复（本载荷），
 * 让批量任务的启动表现为一次新的对话轮，并随消息一起落库。
 */

export const TASK_RUN_VERSION = 1;

export type TaskRunError = {
  targetId: string;
  error: string;
};

export type TaskRunPayload = {
  version: typeof TASK_RUN_VERSION;
  runId: string;
  /** 来源 TaskProposal 的 skillId（batch_product_improve / batch_picture_translate …） */
  skillId: string;
  /** 任务标题，如「批量翻译商品图片」 */
  title: string;
  /** 创建成功的 AITask id 列表（轮询聚合进度用） */
  taskIds: string[];
  /** 创建失败的对象 */
  errors: TaskRunError[];
  /** 人读参数摘要，如 ["源语言：自动检测", "目标语言：English"] */
  paramsSummary: string[];
  startedAt: string;
};

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function buildTaskRunPayload(args: {
  skillId: string;
  title: string;
  taskIds: string[];
  errors: TaskRunError[];
  paramsSummary: string[];
}): TaskRunPayload {
  return {
    version: TASK_RUN_VERSION,
    runId: `run-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: args.skillId,
    title: args.title,
    taskIds: args.taskIds,
    errors: args.errors,
    paramsSummary: args.paramsSummary,
    startedAt: new Date().toISOString(),
  };
}

/** 防御式解析（数据库 payloads 反序列化用）。结构不合法返回 null。 */
export function coerceTaskRunPayload(raw: unknown): TaskRunPayload | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const skillId = safeString(r.skillId);
  const title = safeString(r.title);
  if (!skillId || !title) return null;
  const taskIds = Array.isArray(r.taskIds)
    ? r.taskIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  const errors = Array.isArray(r.errors)
    ? r.errors
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map((e) => ({ targetId: safeString(e.targetId), error: safeString(e.error, "创建失败") }))
    : [];
  const paramsSummary = Array.isArray(r.paramsSummary)
    ? r.paramsSummary.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  return {
    version: TASK_RUN_VERSION,
    runId: safeString(r.runId, `run-${Date.now()}`),
    skillId,
    title,
    taskIds,
    errors,
    paramsSummary,
    startedAt: safeString(r.startedAt, new Date().toISOString()),
  };
}
