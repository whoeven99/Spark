import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { getRedis } from "../lib/redis.js";
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

    res.json({ jobs: resources, total: resources.length });
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

translationsRouter.get("/:jobId", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const { jobId } = req.params;
    const shop = (req.query.shop as string | undefined)?.trim();

    if (shop) {
      const { resource } = await container
        .item(jobId, shop)
        .read<TranslationV4Job>();
      if (!resource) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json({ job: resource });
    } else {
      // cross-partition lookup
      const { resources } = await container.items
        .query<TranslationV4Job>(
          {
            query: "SELECT * FROM c WHERE c.id = @id",
            parameters: [{ name: "@id", value: jobId }],
          },
        )
        .fetchAll();
      const job = resources[0] ?? null;
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json({ job });
    }
  } catch (err) {
    console.error("[translations/:id]", err);
    res.status(500).json({ error: String(err) });
  }
});
