/** Spark 创建、AgentTask Camunda V4 轮询使用的 taskType */
export const SPARK_TRANSLATION_V4_TASK_TYPE = "spark-transtion";

/** 列表 API 未传 taskType 时的默认值 */
export const DEFAULT_TRANSLATION_TASK_LIST_TYPES = [SPARK_TRANSLATION_V4_TASK_TYPE] as const;

export function parseTaskTypeQueryParam(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
