import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { enrichJobWithLiveProgress, enrichJobsWithLiveProgress } from "../lib/v4Progress.js";
import { getRedis, batchHgetall, batchLrange } from "../lib/redis.js";
import { blobListPaths, blobRead, isBlobConfigured } from "../lib/blob.js";
import { repairStuckTranslationJobs } from "../lib/repairStuckTranslationJobs.js";
import {
  buildTranslationJobFilters,
  parseTranslationJobFiltersFromQuery,
  translationJobWhereClause,
} from "../lib/translationJobFilters.js";
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
    const filters = parseTranslationJobFiltersFromQuery(
      req.query as Record<string, string | undefined>,
    );
    const limit = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const { conditions, params } = buildTranslationJobFilters(filters);

    let query =
      "SELECT c.id, c.shopName, c.source, c.target, c.modules, c.status, c.aiModel, c.metrics, c.taskSource, c.isCover, c.errorMessage, c.errorStage, c.createdAt, c.updatedAt, c.claimedBy, c.lastHeartbeat FROM c";
    query += translationJobWhereClause(conditions);
    query += " ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit";
    params.push({ name: "@offset", value: offset });
    params.push({ name: "@limit", value: limit });

    const { resources } = await container.items
      .query<TranslationV4Job>(
        { query, parameters: params },
        { maxItemCount: limit },
      )
      .fetchAll();

    const jobs = await enrichJobsWithLiveProgress(resources);
    res.json({ jobs, total: jobs.length, offset, limit });
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
    const hashes = await batchHgetall(redis, keys);

    const stats: LLMKeyStatRow[] = hashes
      .filter((h) => !!h.label)
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

    const lists = await batchLrange(redis, keys, 0, -1);

    const history: Record<string, HistoryEntry[]> = {};
    keys.forEach((k, i) => {
      const label = k.replace("translate:v4:keystatlog:", "");
      const raw = lists[i] ?? [];
      history[label] = raw.map((s) => JSON.parse(s) as HistoryEntry);
    });

    res.json({ history });
  } catch (err) {
    console.error("[key-stats/history]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── 商店域名搜索（Cosmos 任务历史）──────────────────────────────────────────
translationsRouter.get("/shops", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ shops: [], note: "Cosmos not configured" });
    return;
  }

  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const limit = Math.min(Number(req.query.limit ?? 30), 50);

  try {
    const container = getTranslationJobsContainer();
    let shops: string[] = [];

    if (search) {
      const { resources } = await container.items
        .query<string>({
          query: `
            SELECT DISTINCT VALUE c.shopName
            FROM c
            WHERE CONTAINS(c.shopName, @search, true)
            OFFSET 0 LIMIT @limit
          `,
          parameters: [
            { name: "@search", value: search },
            { name: "@limit", value: limit },
          ],
        })
        .fetchAll();
      shops = resources;
    } else {
      const { resources } = await container.items
        .query<{ shopName: string }>({
          query: "SELECT TOP 120 c.shopName FROM c ORDER BY c.createdAt DESC",
        })
        .fetchAll();
      const seen = new Set<string>();
      for (const row of resources) {
        if (!row.shopName || seen.has(row.shopName)) continue;
        seen.add(row.shopName);
        shops.push(row.shopName);
        if (shops.length >= limit) break;
      }
    }

    res.json({ shops });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ shops: [], note: "翻译任务容器不存在或无访问权限" });
      return;
    }
    console.error("[translations/shops]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── 单店语言对列表（用于筛选下拉）────────────────────────────────────────────
translationsRouter.get("/lang-pairs", async (req, res) => {
  const shop = (req.query.shop as string | undefined)?.trim();
  if (!shop) {
    res.status(400).json({ error: "shop query parameter is required" });
    return;
  }
  if (!isCosmosConfigured()) {
    res.json({ pairs: [], note: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const filters = parseTranslationJobFiltersFromQuery(
      req.query as Record<string, string | undefined>,
    );
    const { conditions, params } = buildTranslationJobFilters({
      ...filters,
      shop,
      langFrom: undefined,
      langTo: undefined,
    });
    const where = translationJobWhereClause(conditions);

    const { resources } = await container.items
      .query<{ source: string; target: string; taskCount: number; tokens: number }>({
        query: `
          SELECT c.source, c.target, COUNT(1) AS taskCount, SUM(c.metrics.usedTokens) AS tokens
          FROM c
          ${where}
          GROUP BY c.source, c.target
        `,
        parameters: params,
      })
      .fetchAll();

    const pairs = resources
      .map((r) => ({
        source: r.source,
        target: r.target,
        taskCount: r.taskCount,
        tokens: Number(r.tokens ?? 0),
      }))
      .sort((a, b) => b.taskCount - a.taskCount);

    res.json({ pairs });
  } catch (err) {
    console.error("[translations/lang-pairs]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── 单店任务消耗汇总 ─────────────────────────────────────────────────────────
// 按状态聚合任务数与 Token 消耗。必须注册在 /:jobId 之前。
translationsRouter.get("/shop-summary", async (req, res) => {
  const filters = parseTranslationJobFiltersFromQuery(
    req.query as Record<string, string | undefined>,
  );
  const shop = filters.shop?.trim();
  if (!shop) {
    res.status(400).json({ error: "shop query parameter is required" });
    return;
  }
  if (!isCosmosConfigured()) {
    res.json({
      shop,
      taskCount: 0,
      totalTokens: 0,
      byStatus: [],
      filters: { langFrom: filters.langFrom ?? null, langTo: filters.langTo ?? null, createdFrom: filters.createdFrom ?? null, createdTo: filters.createdTo ?? null },
      note: "Cosmos not configured",
    });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const { conditions, params } = buildTranslationJobFilters({ ...filters, shop });
    const where = translationJobWhereClause(conditions);

    const { resources: byStatus } = await container.items
      .query<{ status: string; taskCount: number; tokens: number }>({
        query: `
          SELECT c.status, COUNT(1) AS taskCount, SUM(c.metrics.usedTokens) AS tokens
          FROM c
          ${where}
          GROUP BY c.status
        `,
        parameters: params,
      })
      .fetchAll();

    const { resources: countRows } = await container.items
      .query<number>({
        query: `SELECT VALUE COUNT(1) FROM c${where}`,
        parameters: params,
      })
      .fetchAll();

    const { resources: tokenRows } = await container.items
      .query<number>({
        query: `SELECT VALUE SUM(c.metrics.usedTokens) FROM c${where}`,
        parameters: params,
      })
      .fetchAll();

    const rows = byStatus.map((r) => ({
      status: r.status,
      taskCount: r.taskCount,
      tokens: Number(r.tokens ?? 0),
    }));

    res.json({
      shop,
      taskCount: countRows[0] ?? 0,
      totalTokens: Number(tokenRows[0] ?? 0),
      byStatus: rows,
      filters: {
        langFrom: filters.langFrom ?? null,
        langTo: filters.langTo ?? null,
        createdFrom: filters.createdFrom ?? null,
        createdTo: filters.createdTo ?? null,
      },
    });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({
        shop,
        taskCount: 0,
        totalTokens: 0,
        byStatus: [],
        note: "翻译任务容器不存在或无访问权限",
      });
      return;
    }
    console.error("[translations/shop-summary]", err);
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

// 列出该任务「确有翻译内容」的模块（仅列 blob 文件名，不下载内容）。
/**
 * POST /api/translations/repair-stuck
 * 回收僵死的 processing 任务（发版中断等），并唤醒排队任务。
 * Body: { heartbeatGraceMs?, jobIds?, wakeQueuedHints? }
 */
translationsRouter.post("/repair-stuck", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }

  try {
    const body = (req.body ?? {}) as {
      heartbeatGraceMs?: number;
      jobIds?: string[];
      wakeQueuedHints?: boolean;
    };
    const result = await repairStuckTranslationJobs({
      heartbeatGraceMs: body.heartbeatGraceMs,
      jobIds: body.jobIds,
      wakeQueuedHints: body.wakeQueuedHints,
    });
    console.log(
      `[translations/repair-stuck] repaired=${result.repaired.length} hints=${result.hintsPushed} wake=${result.wakeHints}`,
    );
    res.json(result);
  } catch (err) {
    console.error("[translations/repair-stuck]", err);
    res.status(500).json({ error: String(err) });
  }
});

translationsRouter.get("/:jobId/content/modules", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }
  if (!isBlobConfigured()) {
    res.json({ modules: [], note: "Blob 未配置" });
    return;
  }
  try {
    const container = getTranslationJobsContainer();
    const { jobId } = req.params;
    const shop = (req.query.shop as string | undefined)?.trim();

    type JobLite = Pick<TranslationV4Job, "id" | "modules"> & { blobPrefix?: string };
    let job: JobLite | null = null;
    if (shop) {
      const { resource } = await container.item(jobId, shop).read<JobLite>();
      job = resource ?? null;
    } else {
      const { resources } = await container.items
        .query<JobLite>({
          query: "SELECT c.id, c.modules, c.blobPrefix FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: jobId }],
        })
        .fetchAll();
      job = resources[0] ?? null;
    }
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const blobPrefix = job.blobPrefix;
    const modules = job.modules ?? [];
    if (!blobPrefix) {
      res.json({ modules: [], note: "该任务无 blobPrefix（可能为旧任务）" });
      return;
    }

    const out = await Promise.all(
      modules.map(async (module) => {
        const paths = await blobListPaths(`${blobPrefix}/translate/${module}/`);
        const count = paths.filter(
          (p) => p.endsWith(".json") && p.includes("/resources/"),
        ).length;
        const legacy = paths.filter(
          (p) => p.endsWith(".json") && !p.includes("/resources/"),
        ).length;
        return { module, count, hasContent: count > 0 || legacy > 0 };
      }),
    );

    res.json({ modules: out.filter((m) => m.hasContent) });
  } catch (err) {
    console.error("[translations/:id/content/modules]", err);
    res.status(500).json({ error: String(err) });
  }
});

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
