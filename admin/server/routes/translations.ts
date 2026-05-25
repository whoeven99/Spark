import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import type { TranslationV4Job } from "../types/translation.js";

export const translationsRouter = Router();

translationsRouter.get("/", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ jobs: [], total: 0, note: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const status = (req.query.status as string | undefined)?.trim();
    const shop = (req.query.shop as string | undefined)?.trim();
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    let query =
      "SELECT c.id, c.shopName, c.source, c.target, c.modules, c.status, c.aiModel, c.metrics, c.errorMessage, c.errorStage, c.createdAt, c.updatedAt, c.claimedBy FROM c";
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
