export type ScheduleLogRecord = {
  id: string;
  taskId: string;
  shopName: string;
  taskName?: string;
  eventType: string;
  statusBefore?: number;
  statusAfter?: number;
  queueStage?: string;
  enqueuedAt?: number;
  dequeuedAt?: number;
  processedAt?: number;
  message: string;
  errorMsg?: string;
  success: boolean;
  createdAt: number;
  source: string;
};

export type ScheduleLogResponse = {
  logs: ScheduleLogRecord[];
  summary?: Record<string, number>;
  total: number;
  taskDetail?: Record<string, unknown>;
  shopName?: string;
  timeRange?: { startTime: number; endTime: number };
};

/**
 * 按任务 ID 查询调度日志
 */
export async function fetchScheduleLogsByTaskId(taskId: string, limit: number = 100): Promise<ScheduleLogResponse | null> {
  try {
    const url = new URL("/api/translate/v3/json-schedule-logs", window.location.origin);
    url.searchParams.set("queryType", "task");
    url.searchParams.set("taskId", taskId);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.success) {
      console.error("Failed to fetch schedule logs:", data.errorMsg);
      return null;
    }

    return data.response as ScheduleLogResponse;
  } catch (error) {
    console.error("Error fetching schedule logs by taskId:", error);
    return null;
  }
}

/**
 * 按店铺和时间范围查询调度日志
 */
export async function fetchScheduleLogsByShop(
  shopName: string,
  startTime?: number,
  endTime?: number,
  limit: number = 100
): Promise<ScheduleLogResponse | null> {
  try {
    const url = new URL("/api/translate/v3/json-schedule-logs", window.location.origin);
    url.searchParams.set("queryType", "shop");
    url.searchParams.set("shopName", shopName);
    if (startTime) url.searchParams.set("startTime", String(startTime));
    if (endTime) url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.success) {
      console.error("Failed to fetch schedule logs:", data.errorMsg);
      return null;
    }

    return data.response as ScheduleLogResponse;
  } catch (error) {
    console.error("Error fetching schedule logs by shop:", error);
    return null;
  }
}

/**
 * 查询调度日志统计摘要
 */
export async function fetchScheduleLogSummary(taskId: string): Promise<Record<string, number> | null> {
  try {
    const url = new URL("/api/translate/v3/json-schedule-logs", window.location.origin);
    url.searchParams.set("queryType", "summary");
    url.searchParams.set("taskId", taskId);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.success) {
      console.error("Failed to fetch schedule log summary:", data.errorMsg);
      return null;
    }

    return (data.response?.summary || {}) as Record<string, number>;
  } catch (error) {
    console.error("Error fetching schedule log summary:", error);
    return null;
  }
}

/**
 * 获取事件类型的中文标签
 */
export function getEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    ENQUEUED_INIT: "入队 (初始化)",
    ENQUEUED_TRANSLATE: "入队 (翻译)",
    DEQUEUED_INIT: "出队 (初始化)",
    DEQUEUED_TRANSLATE: "出队 (翻译)",
    PROCESS_INIT_START: "开始处理 (初始化)",
    PROCESS_INIT_END: "完成处理 (初始化)",
    PROCESS_TRANSLATE_START: "开始处理 (翻译)",
    PROCESS_TRANSLATE_END: "完成处理 (翻译)",
    PROCESS_INIT_ERROR: "处理失败 (初始化)",
    PROCESS_TRANSLATE_ERROR: "处理失败 (翻译)",
  };
  return labels[eventType] || eventType;
}

/**
 * 获取事件类型的颜色
 */
export function getEventTypeColor(eventType: string): string {
  if (eventType.includes("ENQUEUED")) return "blue";
  if (eventType.includes("DEQUEUED")) return "purple";
  if (eventType.includes("START")) return "orange";
  if (eventType.includes("END")) return "green";
  if (eventType.includes("ERROR")) return "red";
  return "gray";
}
