import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getAgentRunsContainer, isCosmosConfigured } from "../lib/cosmos.js";

export const agentRunsRouter = Router();

const PERIOD_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

type RunRow = {
  feature: string;
  status: string;
  durationMs: number;
  error?: { code?: string; message: string };
};

agentRunsRouter.get("/stats", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ note: "Cosmos not configured", summary: null, byFeature: [], topErrors: [] });
    return;
  }

  try {
    const container = getAgentRunsContainer();
    const period = (req.query.period as string) ?? "24h";
    const periodMs = PERIOD_MS[period] ?? PERIOD_MS["24h"];
    const cutoff = new Date(Date.now() - periodMs).toISOString();

    const { resources } = await container.items
      .query<RunRow>(
        {
          query:
            "SELECT c.feature, c.status, c.durationMs, c.error FROM c WHERE c.startedAt >= @cutoff OFFSET 0 LIMIT 5000",
          parameters: [{ name: "@cutoff", value: cutoff }],
        },
        { maxItemCount: 500 },
      )
      .fetchAll();

    type FeatureStat = {
      total: number;
      success: number;
      error: number;
      timeout: number;
      partial: number;
      totalDuration: number;
    };
    const byFeatureMap: Record<string, FeatureStat> = {};
    const errorCounts: Record<string, number> = {};

    for (const r of resources) {
      const f = r.feature ?? "unknown";
      if (!byFeatureMap[f]) {
        byFeatureMap[f] = { total: 0, success: 0, error: 0, timeout: 0, partial: 0, totalDuration: 0 };
      }
      byFeatureMap[f].total++;
      if (r.status === "success") byFeatureMap[f].success++;
      else if (r.status === "error") byFeatureMap[f].error++;
      else if (r.status === "timeout") byFeatureMap[f].timeout++;
      else if (r.status === "partial") byFeatureMap[f].partial++;
      byFeatureMap[f].totalDuration += r.durationMs ?? 0;

      if (r.error?.message) {
        const key = r.error.message.slice(0, 120);
        errorCounts[key] = (errorCounts[key] ?? 0) + 1;
      }
    }

    const total = resources.length;
    const successCount = resources.filter((r) => r.status === "success").length;
    const errorCount = resources.filter((r) => r.status === "error" || r.status === "timeout").length;
    const avgDurationMs =
      total > 0 ? Math.round(resources.reduce((s, r) => s + (r.durationMs ?? 0), 0) / total) : 0;

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const byFeature = Object.entries(byFeatureMap).map(([feature, stat]) => ({
      feature,
      total: stat.total,
      success: stat.success,
      error: stat.error,
      timeout: stat.timeout,
      partial: stat.partial,
      successRate: stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 0,
      avgDurationMs: stat.total > 0 ? Math.round(stat.totalDuration / stat.total) : 0,
    }));

    res.json({
      summary: { total, successCount, errorCount, successRate: total > 0 ? Math.round((successCount / total) * 100) : 0, avgDurationMs, period, cutoff },
      byFeature,
      topErrors,
    });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ note: "agent_runs 容器不存在或无访问权限", summary: null, byFeature: [], topErrors: [] });
      return;
    }
    console.error("[agent-runs/stats]", err);
    res.status(500).json({ error: String(err) });
  }
});

agentRunsRouter.get("/", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ runs: [], note: "Cosmos not configured" });
    return;
  }

  try {
    const container = getAgentRunsContainer();
    const feature = (req.query.feature as string | undefined)?.trim();
    const status = (req.query.status as string | undefined)?.trim();
    const shop = (req.query.shop as string | undefined)?.trim();
    const period = (req.query.period as string) ?? "24h";
    const periodMs = PERIOD_MS[period] ?? PERIOD_MS["24h"];
    const cutoff = new Date(Date.now() - periodMs).toISOString();
    const limit = Math.min(Number(req.query.limit ?? 100), 200);

    const conditions = ["c.startedAt >= @cutoff"];
    const params: SqlParameter[] = [{ name: "@cutoff", value: cutoff }];

    if (feature) {
      conditions.push("c.feature = @feature");
      params.push({ name: "@feature", value: feature });
    }
    if (status) {
      conditions.push("c.status = @status");
      params.push({ name: "@status", value: status });
    }
    if (shop) {
      conditions.push("c.shop = @shop");
      params.push({ name: "@shop", value: shop });
    }
    params.push({ name: "@limit", value: limit });

    const query = `SELECT c.id, c.shop, c.appName, c.feature, c.status, c.startedAt, c.durationMs, c.error, c.langsmithRunId, c.langsmithProject, c.tools, c.tokenUsage, c.reflection, c.inputSummary FROM c WHERE ${conditions.join(" AND ")} ORDER BY c.startedAt DESC OFFSET 0 LIMIT @limit`;

    const { resources } = await container.items
      .query({ query, parameters: params }, { maxItemCount: 100 })
      .fetchAll();

    res.json({ runs: resources });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ runs: [], note: "agent_runs 容器不存在或无访问权限" });
      return;
    }
    console.error("[agent-runs]", err);
    res.status(500).json({ error: String(err) });
  }
});
