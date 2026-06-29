/**
 * 手动回收发版/异常退出后僵死的 processing 任务，并唤醒排队中的任务。
 * 逻辑对齐 worker/scripts/resume-orphaned-processing.mjs + deploy-wake hint。
 */
import type { SqlParameter } from "@azure/cosmos";
import { getTranslationJobsContainer } from "./cosmos.js";
import { getRedis } from "./redis.js";
import type { TranslationV4Job, TranslationV4Status } from "../types/translation.js";

const PROCESSING_TO_QUEUED: Array<
  [TranslationV4Status, TranslationV4Status, "init" | "translate" | "writeback" | null]
> = [
  ["INITIALIZING", "INIT_QUEUED", "init"],
  ["TRANSLATING", "TRANSLATE_QUEUED", "translate"],
  ["WRITING_BACK", "WRITEBACK_QUEUED", "writeback"],
  ["VERIFYING", "VERIFY_QUEUED", null],
];

const HINT_KEYS = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
} as const;

const BUSY_FOR_QUEUED: Partial<Record<TranslationV4Status, TranslationV4Status>> = {
  INIT_QUEUED: "INITIALIZING",
  TRANSLATE_QUEUED: "TRANSLATING",
  WRITEBACK_QUEUED: "WRITING_BACK",
};

export type RepairedJobRow = {
  id: string;
  shopName: string;
  from: TranslationV4Status;
  to: TranslationV4Status;
  lastHeartbeat: string | null;
  claimedBy: string | null;
};

export type RepairStuckResult = {
  ok: true;
  repaired: RepairedJobRow[];
  hintsPushed: number;
  wakeHints: number;
};

export type RepairStuckOptions = {
  /** 心跳超过该毫秒数视为僵死，默认 60s */
  heartbeatGraceMs?: number;
  /** 仅修复指定 jobId（仍需满足 processing + 心跳条件） */
  jobIds?: string[];
  /** 修复后为无在飞任务的店铺补推 hint，默认 true */
  wakeQueuedHints?: boolean;
};

async function pushHint(
  stage: keyof typeof HINT_KEYS,
  payload: { taskId: string; shopName: string },
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  await redis.rpush(HINT_KEYS[stage], JSON.stringify(payload));
  return true;
}

async function countShopInStatus(
  shopName: string,
  status: TranslationV4Status,
): Promise<number> {
  const container = getTranslationJobsContainer();
  const { resources } = await container.items
    .query<number>(
      {
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.shopName = @shopName AND c.status = @status",
        parameters: [
          { name: "@shopName", value: shopName },
          { name: "@status", value: status },
        ],
      },
      { partitionKey: shopName },
    )
    .fetchAll();
  const n = resources[0];
  return typeof n === "number" && n > 0 ? n : 0;
}

async function wakeIdleShopHints(): Promise<number> {
  const container = getTranslationJobsContainer();
  let pushed = 0;
  for (const [queuedStatus, busyStatus] of Object.entries(BUSY_FOR_QUEUED)) {
    const queued = queuedStatus as TranslationV4Status;
    const busy = busyStatus as TranslationV4Status;
    const stage = PROCESSING_TO_QUEUED.find(([, q]) => q === queued)?.[2];
    if (!stage) continue;

    const { resources } = await container.items
      .query<Pick<TranslationV4Job, "id" | "shopName">>(
        {
          query:
            "SELECT c.id, c.shopName FROM c WHERE c.status = @status ORDER BY c.updatedAt ASC OFFSET 0 LIMIT 100",
          parameters: [{ name: "@status", value: queued }],
        },
      )
      .fetchAll();

    const seenShops = new Set<string>();
    for (const job of resources) {
      if (seenShops.has(job.shopName)) continue;
      if ((await countShopInStatus(job.shopName, busy)) > 0) continue;
      if (await pushHint(stage, { taskId: job.id, shopName: job.shopName })) {
        pushed++;
        seenShops.add(job.shopName);
      }
    }
  }
  return pushed;
}

export async function repairStuckTranslationJobs(
  options: RepairStuckOptions = {},
): Promise<RepairStuckResult> {
  const heartbeatGraceMs = Math.max(
    5_000,
    options.heartbeatGraceMs ??
      (Number(process.env.REPAIR_HEARTBEAT_GRACE_MS) || 60_000),
  );
  const threshold = new Date(Date.now() - heartbeatGraceMs).toISOString();
  const jobIdFilter =
    options.jobIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  const wakeQueuedHints = options.wakeQueuedHints !== false;

  const container = getTranslationJobsContainer();
  const processingStatuses = PROCESSING_TO_QUEUED.map(([p]) => p);
  const params: SqlParameter[] = [
    { name: "@threshold", value: threshold },
    ...processingStatuses.map((s, i) => ({
      name: `@p${i}`,
      value: s,
    })),
  ];
  const statusIn = processingStatuses.map((_, i) => `@p${i}`).join(", ");

  let query = `
    SELECT c.id, c.shopName, c.status, c.claimedBy, c.lastHeartbeat, c.updatedAt
    FROM c
    WHERE c.status IN (${statusIn})
      AND (NOT IS_DEFINED(c.lastHeartbeat) OR IS_NULL(c.lastHeartbeat) OR c.lastHeartbeat < @threshold)
  `;
  if (jobIdFilter.length > 0) {
    query += ` AND (${jobIdFilter.map((_, i) => `c.id = @jid${i}`).join(" OR ")})`;
    for (let i = 0; i < jobIdFilter.length; i++) {
      params.push({ name: `@jid${i}`, value: jobIdFilter[i]! });
    }
  }

  const { resources: candidates } = await container.items
    .query<
      Pick<
        TranslationV4Job,
        "id" | "shopName" | "status" | "claimedBy" | "lastHeartbeat" | "updatedAt"
      >
    >({ query, parameters: params })
    .fetchAll();

  const repaired: RepairedJobRow[] = [];
  let hintsPushed = 0;

  for (const row of candidates) {
    const mapping = PROCESSING_TO_QUEUED.find(([p]) => p === row.status);
    if (!mapping) continue;
    const [, resetStatus, hintStage] = mapping;

    const { resource: current } = await container.item(row.id, row.shopName).read();
    if (!current) continue;
    if (current.status !== row.status) continue;

    await container.item(row.id, row.shopName).replace({
      ...current,
      status: resetStatus,
      claimedBy: null,
      claimedAt: null,
      updatedAt: new Date().toISOString(),
    });

    if (hintStage) {
      if (await pushHint(hintStage, { taskId: row.id, shopName: row.shopName })) {
        hintsPushed++;
      }
    }

    repaired.push({
      id: row.id,
      shopName: row.shopName,
      from: row.status as TranslationV4Status,
      to: resetStatus,
      lastHeartbeat:
        typeof row.lastHeartbeat === "string" ? row.lastHeartbeat : null,
      claimedBy: typeof row.claimedBy === "string" ? row.claimedBy : null,
    });
  }

  const wakeHints = wakeQueuedHints ? await wakeIdleShopHints() : 0;

  return { ok: true, repaired, hintsPushed, wakeHints };
}
