const uuidv4 = () => (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
import { getAgentRunsSparkOpsContainer, isCosmosSparkOpsConfigured } from "../cosmos/cosmosSparkOps.server";

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

/** Write a schedule log entry into Cosmos agent_runs container. */
export async function writeScheduleLog(record: Partial<ScheduleLogRecord>): Promise<void> {
  if (!isCosmosSparkOpsConfigured()) return;
  try {
    const container = getAgentRunsSparkOpsContainer();
    const now = Date.now();
    const doc: ScheduleLogRecord = {
      id: record.id ?? uuidv4(),
      taskId: (record.taskId ?? "").trim(),
      shopName: (record.shopName ?? "").trim(),
      taskName: record.taskName,
      eventType: record.eventType ?? "UNKNOWN",
      statusBefore: record.statusBefore,
      statusAfter: record.statusAfter,
      queueStage: record.queueStage,
      enqueuedAt: record.enqueuedAt,
      dequeuedAt: record.dequeuedAt,
      processedAt: record.processedAt,
      message: record.message ?? "",
      errorMsg: record.errorMsg,
      success: record.success ?? true,
      createdAt: record.createdAt ?? now,
      source: record.source ?? "spark",
    };
    await container.items.create(doc, { disableAutomaticIdGeneration: false });
  } catch (err) {
    console.warn("[scheduleLog] write to cosmos failed", err);
  }
}

export async function queryScheduleLogsByTask(taskId: string, limit = 200) {
  if (!isCosmosSparkOpsConfigured()) return null;
  try {
    const container = getAgentRunsSparkOpsContainer();
    const q = {
      query: `SELECT * FROM c WHERE c.taskId = @taskId ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit`,
      parameters: [
        { name: "@taskId", value: taskId },
        { name: "@limit", value: limit },
      ],
    };
    const iter = container.items.query(q, { maxItemCount: limit, partitionKey: taskId });
    const { resources } = await iter.fetchAll();
    return resources as ScheduleLogRecord[];
  } catch (err) {
    console.warn("[scheduleLog] query by task failed", err);
    return null;
  }
}

export async function queryScheduleLogsByShop(shopName: string, startTime?: number, endTime?: number, limit = 200) {
  if (!isCosmosSparkOpsConfigured()) return null;
  try {
    const container = getAgentRunsSparkOpsContainer();
    const where: string[] = [`c.shopName = @shopName`];
    const params: any[] = [{ name: "@shopName", value: shopName }, { name: "@limit", value: limit }];
    if (startTime) {
      where.push("c.createdAt >= @startTime");
      params.push({ name: "@startTime", value: startTime });
    }
    if (endTime) {
      where.push("c.createdAt <= @endTime");
      params.push({ name: "@endTime", value: endTime });
    }
    const q = {
      query: `SELECT * FROM c WHERE ${where.join(" AND ")} ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit`,
      parameters: params,
    };
    const iter = container.items.query(q, { maxItemCount: limit, partitionKey: shopName });
    const { resources } = await iter.fetchAll();
    return resources as ScheduleLogRecord[];
  } catch (err) {
    console.warn("[scheduleLog] query by shop failed", err);
    return null;
  }
}

export async function queryScheduleLogSummary(taskId: string) {
  if (!isCosmosSparkOpsConfigured()) return null;
  try {
    const container = getAgentRunsSparkOpsContainer();
    const q = {
      query: `SELECT c.eventType, COUNT(1) AS cnt FROM c WHERE c.taskId = @taskId GROUP BY c.eventType`,
      parameters: [{ name: "@taskId", value: taskId }],
    };
    const iter = container.items.query(q, { partitionKey: taskId });
    const { resources } = await iter.fetchAll();
    const map: Record<string, number> = {};
    for (const r of resources as Array<{ eventType?: string; cnt?: number }>) {
      if (r.eventType) map[r.eventType] = Number(r.cnt) || 0;
    }
    return map;
  } catch (err) {
    console.warn("[scheduleLog] summary failed", err);
    return null;
  }
}
