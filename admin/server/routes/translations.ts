import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { enrichJobWithLiveProgress, enrichJobsWithLiveProgress } from "../lib/v4Progress.js";
import { getRedis } from "../lib/redis.js";
import { blobListPaths, blobRead, isBlobConfigured } from "../lib/blob.js";
import type { TranslationV4Job } from "../types/translation.js";

export const translationsRouter = Router();

/** 自动翻译任务来源标识（与 worker cosmosV4.ts TSF_AUTO_TASK_SOURCE 保持一致）。 */
const AUTO_TASK_SOURCE = "TsFrontend-Auto";

translationsRouter.get("/", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ jobs: [], total: 0, note: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const status = (req.query.status as string | undefined)?.trim();
    const shop = (req.query.shop as string | undefined)?.trim();
    const source = (req.query.source as string | undefined)?.trim();
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    let query =
      "SELECT c.id, c.shopName, c.source, c.target, c.modules, c.status, c.aiModel, c.metrics, c.taskSource, c.isCover, c.errorMessage, c.errorStage, c.createdAt, c.updatedAt, c.claimedBy FROM c";
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push("c.status = @status");
      params.push({ name: "@status", value: status });
    }
    if (shop) {
      conditions.push("c.shopName = @shop");
      params.push({ name: "@shop", value: shop });
    }
    if (source) {
      conditions.push("c.taskSource = @source");
      params.push({ name: "@source", value: source });
    }
    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit";
    params.push({ name: "@limit", value: limit });

    const { resources } = await container.items
      .query<TranslationV4Job>(
        { query, parameters: params },
        { maxItemCount: limit },
      )
      .fetchAll();

    const jobs = await enrichJobsWithLiveProgress(resources);
    res.json({ jobs, total: jobs.length });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ jobs: [], total: 0, note: "翻译任务容器不存在或无访问权限" });
      return;
    }
    console.error("[translations]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── LLM key-pool stats ────────────────────────────────────────────────────────
// Reads per-key stats written by the translate worker every ~10 s.
// Must be registered before /:jobId so Express doesn't mistake "key-stats" for a jobId.

export type LLMKeyStatRow = {
  label: string;
  calls: number;
  tokens: number;
  avgLatencyMs: number;
  throttleCount: number;
  errors: number;
  poolConcurrency: number;
  limitReq: number;
  remainingReq: number;
  limitTok: number;
  remainingTok: number;
  updatedAt: number;
};

translationsRouter.get("/key-stats", async (_req, res) => {
  const redis = getRedis();
  if (!redis) {
    res.json({ stats: [], note: "Redis not configured" });
    return;
  }
  try {
    const keys = await redis.keys("translate:v4:keystat:*");
    if (keys.length === 0) {
      res.json({ stats: [] });
      return;
    }
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();

    const stats: LLMKeyStatRow[] = (results ?? [])
      .map((r): Record<string, string> | null => r?.[1] as Record<string, string> | null)
      .filter((h): h is Record<string, string> => !!h && !!h.label)
      .map((h: Record<string, string>): LLMKeyStatRow => ({
        label:           h.label,
        calls:           Number(h.calls           ?? 0),
        tokens:          Number(h.tokens          ?? 0),
        avgLatencyMs:    Number(h.avgLatencyMs     ?? 0),
        throttleCount:   Number(h.throttleCount    ?? 0),
        errors:          Number(h.errors           ?? 0),
        poolConcurrency: Number(h.poolConcurrency  ?? 0),
        limitReq:        Number(h.limitReq         ?? -1),
        remainingReq:    Number(h.remainingReq     ?? -1),
        limitTok:        Number(h.limitTok         ?? -1),
        remainingTok:    Number(h.remainingTok     ?? -1),
        updatedAt:       Number(h.updatedAt        ?? 0),
      }))
      .sort((a: LLMKeyStatRow, b: LLMKeyStatRow) => a.label.localeCompare(b.label));

    res.json({ stats });
  } catch (err) {
    console.error("[key-stats]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── LLM key-pool history ──────────────────────────────────────────────────────
// Returns the rolling 30-min history log for all (or one) key slot(s).
// Each entry is one flush snapshot written by the worker every ~10 s.

export type HistoryEntry = {
  t:    number; // epoch ms
  dC:   number; // delta calls since last flush
  dT:   number; // delta tokens since last flush
  lat:  number; // avg latency ms (EWMA)
  conc: number; // pool concurrency cap
  rR:   number; // remaining requests (-1 = unknown)
  lR:   number; // limit requests
  rT:   number; // remaining tokens
  lT:   number; // limit tokens
};

translationsRouter.get("/key-stats/history", async (req, res) => {
  const redis = getRedis();
  if (!redis) {
    res.json({ history: {} });
    return;
  }
  try {
    // Optional ?label= filter to fetch only one key's history
    const labelFilter = (req.query.label as string | undefined)?.trim();
    const pattern = labelFilter
      ? `translate:v4:keystatlog:${labelFilter}`
      : "translate:v4:keystatlog:*";
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      res.json({ history: {} });
      return;
    }

    const pipe = redis.pipeline();
    for (const k of keys) pipe.lrange(k, 0, -1);
    const results = await pipe.exec();

    const history: Record<string, HistoryEntry[]> = {};
    keys.forEach((k, i) => {
      const label = k.replace("translate:v4:keystatlog:", "");
      const raw = (results?.[i]?.[1] as string[] | null) ?? [];
      history[label] = raw.map((s) => JSON.parse(s) as HistoryEntry);
    });

    res.json({ history });
  } catch (err) {
    console.error("[key-stats/history]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── 自动翻译任务汇总 ─────────────────────────────────────────────────────────
// 一眼看过去：各状态计数 + 今日新建数。必须注册在 /:jobId 之前。
translationsRouter.get("/auto/summary", async (_req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ byStatus: {}, total: 0, createdToday: 0, note: "Cosmos not configured" });
    return;
  }
  try {
    const container = getTranslationJobsContainer();

    const { resources: statusRows } = await container.items
      .query<{ status: string; n: number }>({
        query:
          "SELECT c.status, COUNT(1) AS n FROM c WHERE c.taskSource = @auto GROUP BY c.status",
        parameters: [{ name: "@auto", value: AUTO_TASK_SOURCE }],
      })
      .fetchAll();

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) {
      byStatus[r.status] = r.n;
      total += r.n;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { resources: todayRows } = await container.items
      .query<number>({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.taskSource = @auto AND c.createdAt >= @start",
        parameters: [
          { name: "@auto", value: AUTO_TASK_SOURCE },
          { name: "@start", value: todayStart.toISOString() },
        ],
      })
      .fetchAll();

    res.json({ byStatus, total, createdToday: todayRows[0] ?? 0 });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ byStatus: {}, total: 0, createdToday: 0, note: "翻译任务容器不存在或无访问权限" });
      return;
    }
    console.error("[translations/auto/summary]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── 翻译内容（blob）分页查看 ─────────────────────────────────────────────────
// 读取某任务某模块下的逐资源翻译结果（翻译前/后），按资源分页。
// 必须注册在 /:jobId 之前（虽然路径段数不同不会冲突，仍按惯例靠前注册）。

type BlobTranslatedResource = {
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest?: string;
    status?: string;
  }>;
};

translationsRouter.get("/:jobId/content", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }
  if (!isBlobConfigured()) {
    res.json({ items: [], total: 0, modules: [], module: null, page: 1, pageSize: 10, note: "Blob 未配置" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const { jobId } = req.params;
    const shop = (req.query.shop as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 10), 1), 50);

    type JobLite = Pick<TranslationV4Job, "id" | "shopName" | "modules"> & {
      blobPrefix?: string;
    };
    let job: JobLite | null = null;
    if (shop) {
      const { resource } = await container.item(jobId, shop).read<JobLite>();
      job = resource ?? null;
    } else {
      const { resources } = await container.items
        .query<JobLite>({
          query: "SELECT c.id, c.shopName, c.modules, c.blobPrefix FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: jobId }],
        })
        .fetchAll();
      job = resources[0] ?? null;
    }
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const modules = job.modules ?? [];
    const blobPrefix = job.blobPrefix;
    if (!blobPrefix) {
      res.json({ items: [], total: 0, modules, module: null, page, pageSize, note: "该任务无 blobPrefix（可能为旧任务）" });
      return;
    }

    const module = (req.query.module as string | undefined)?.trim() || modules[0];
    if (!module) {
      res.json({ items: [], total: 0, modules, module: null, page, pageSize });
      return;
    }

    // 优先逐资源 blob：仅列出文件名（元数据），只下载当前页内容。
    const resourcePrefix = `${blobPrefix}/translate/${module}/resources/`;
    const resourcePaths = (await blobListPaths(resourcePrefix))
      .filter((p) => p.endsWith(".json"))
      .sort();

    if (resourcePaths.length > 0) {
      const total = resourcePaths.length;
      const start = (page - 1) * pageSize;
      const pagePaths = resourcePaths.slice(start, start + pageSize);
      const items = (
        await Promise.all(pagePaths.map((p) => blobRead<BlobTranslatedResource>(p)))
      ).filter((x): x is BlobTranslatedResource => !!x);
      res.json({ module, modules, page, pageSize, total, items });
      return;
    }

    // 回退：旧版 chunk-XX.json（每文件是一个数组），整体读取后内存分页。
    const chunkPaths = (await blobListPaths(`${blobPrefix}/translate/${module}/`))
      .filter((p) => p.endsWith(".json") && !p.includes("/resources/"))
      .sort();
    const all: BlobTranslatedResource[] = [];
    for (const p of chunkPaths) {
      const chunk = await blobRead<BlobTranslatedResource[]>(p);
      if (Array.isArray(chunk)) all.push(...chunk);
    }
    const total = all.length;
    const start = (page - 1) * pageSize;
    res.json({ module, modules, page, pageSize, total, items: all.slice(start, start + pageSize) });
  } catch (err) {
    console.error("[translations/:id/content]", err);
    res.status(500).json({ error: String(err) });
  }
});

translationsRouter.get("/:jobId", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const { jobId } = req.params;
    const shop = (req.query.shop as string | undefined)?.trim();

    let job: TranslationV4Job | null = null;
    if (shop) {
      const { resource } = await container
        .item(jobId, shop)
        .read<TranslationV4Job>();
      job = resource ?? null;
    } else {
      const { resources } = await container.items
        .query<TranslationV4Job>({
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: jobId }],
        })
        .fetchAll();
      job = resources[0] ?? null;
    }
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job: await enrichJobWithLiveProgress(job) });
  } catch (err) {
    console.error("[translations/:id]", err);
    res.status(500).json({ error: String(err) });
  }
});
