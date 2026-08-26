import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const prioritySchema = z.enum(["P0", "P1", "P2"]);

export const todayPageAnalysisReplySchema = z.object({
  headline: nonEmptyStringSchema.max(120),
  supports: z.array(nonEmptyStringSchema).min(1).max(3),
  drags: z.array(nonEmptyStringSchema).min(1).max(3),
  priorities: z
    .array(
      z.object({
        title: nonEmptyStringSchema,
        detail: nonEmptyStringSchema,
        priority: prioritySchema,
      }),
    )
    .min(1)
    .max(3),
  missingEvidence: z.array(nonEmptyStringSchema).max(3).default([]),
});

export const todayObjectAnalysisReplySchema = z.object({
  decision: z.enum(["expand", "stop_loss", "watch", "investigate"]),
  headline: nonEmptyStringSchema.max(120),
  reasons: z.array(nonEmptyStringSchema).min(1).max(3),
  nextSteps: z
    .array(
      z.object({
        title: nonEmptyStringSchema,
        detail: nonEmptyStringSchema,
        priority: prioritySchema,
      }),
    )
    .min(1)
    .max(3),
});

export const todayGroupAnalysisReplySchema = z.object({
  groupJudgment: nonEmptyStringSchema.max(120),
  priorities: z
    .array(
      z.object({
        objectTitle: nonEmptyStringSchema,
        decision: z.enum(["expand", "stop_loss", "watch", "investigate"]),
        reason: nonEmptyStringSchema,
      }),
    )
    .min(1)
    .max(5),
  nextEvidence: z.array(nonEmptyStringSchema).min(1).max(3),
});

export const todayTodoRefineReplySchema = z.object({
  todos: z
    .array(
      z.object({
        title: nonEmptyStringSchema,
        action: nonEmptyStringSchema,
        target: nonEmptyStringSchema,
        metric: nonEmptyStringSchema,
        priority: prioritySchema,
      }),
    )
    .min(1)
    .max(3),
});

export type TodayManagedOutputSchemaKey =
  | "today.page.analysis.reply.v1"
  | "today.object.analysis.reply.v1"
  | "today.group.analysis.reply.v1"
  | "today.todo.refine.v1";

export type TodayPageAnalysisReply = z.infer<typeof todayPageAnalysisReplySchema>;
export type TodayObjectAnalysisReply = z.infer<typeof todayObjectAnalysisReplySchema>;
export type TodayGroupAnalysisReply = z.infer<typeof todayGroupAnalysisReplySchema>;
export type TodayTodoRefineReply = z.infer<typeof todayTodoRefineReplySchema>;

export const TODAY_MANAGED_OUTPUT_SCHEMAS: Record<TodayManagedOutputSchemaKey, z.ZodTypeAny> = {
  "today.page.analysis.reply.v1": todayPageAnalysisReplySchema,
  "today.object.analysis.reply.v1": todayObjectAnalysisReplySchema,
  "today.group.analysis.reply.v1": todayGroupAnalysisReplySchema,
  "today.todo.refine.v1": todayTodoRefineReplySchema,
};

const TODAY_MANAGED_OUTPUT_DESCRIPTIONS: Record<TodayManagedOutputSchemaKey, string[]> = {
  "today.page.analysis.reply.v1": [
    '输出 JSON，结构为 {"headline": string, "supports": string[], "drags": string[], "priorities": [{"title": string, "detail": string, "priority": "P0" | "P1" | "P2"}], "missingEvidence": string[] }',
    "headline 是一句页面级经营判断。",
    "supports 表示主要支撑项，drags 表示主要拖累项。",
    "priorities 表示今天最值得先做的处理顺序。",
  ],
  "today.object.analysis.reply.v1": [
    '输出 JSON，结构为 {"decision": "expand" | "stop_loss" | "watch" | "investigate", "headline": string, "reasons": string[], "nextSteps": [{"title": string, "detail": string, "priority": "P0" | "P1" | "P2"}] }',
    "decision 表示对象当前应该继续放大、止损、观察还是继续排查。",
    "reasons 用来说明这个对象判断的核心原因。",
  ],
  "today.group.analysis.reply.v1": [
    '输出 JSON，结构为 {"groupJudgment": string, "priorities": [{"objectTitle": string, "decision": "expand" | "stop_loss" | "watch" | "investigate", "reason": string}], "nextEvidence": string[] }',
    "priorities 表示对象组内的优先处理顺序。",
    "nextEvidence 表示继续下钻最值得补的证据。",
  ],
  "today.todo.refine.v1": [
    '输出 JSON，结构为 {"todos": [{"title": string, "action": string, "target": string, "metric": string, "priority": "P0" | "P1" | "P2"}]}',
    "todos 只保留今天可以开始执行的轻量动作。",
    "每条 todo 都要明确动作、对象和目标指标。",
  ],
};

export function getTodayManagedOutputSchema(schemaKey: TodayManagedOutputSchemaKey) {
  return TODAY_MANAGED_OUTPUT_SCHEMAS[schemaKey];
}

export function getTodayManagedOutputDescription(schemaKey: TodayManagedOutputSchemaKey): string[] {
  return TODAY_MANAGED_OUTPUT_DESCRIPTIONS[schemaKey];
}

export function validateTodayManagedOutput<T>(
  schemaKey: TodayManagedOutputSchemaKey,
  value: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = getTodayManagedOutputSchema(schemaKey).safeParse(value);
  if (result.success) {
    return { success: true, data: result.data as T };
  }
  return { success: false, error: result.error };
}
