import { Router } from "express";
import { getDb } from "../lib/db.js";

export const visitSourceRouter = Router();

/**
 * 入口来源归因列表：哪个商店、什么时间、从什么渠道（utm）点进来过。
 * 支持按商店 / 渠道 / 落地 path / 时间范围筛选 + 分页，并返回按渠道聚合的统计。
 */
visitSourceRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const shop = (req.query.shop as string | undefined)?.trim();
    const utm = (req.query.utm as string | undefined)?.trim();
    const path = (req.query.path as string | undefined)?.trim();
    const startDate = (req.query.startDate as string | undefined)?.trim();
    const endDate = (req.query.endDate as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));

    const where: string[] = [];
    const args: (string | number)[] = [];
    if (shop) {
      where.push("shop LIKE ?");
      args.push(`%${shop}%`);
    }
    if (utm) {
      where.push("utm = ?");
      args.push(utm);
    }
    if (path) {
      where.push("path = ?");
      args.push(path);
    }
    if (startDate) {
      where.push("createdAt >= ?");
      args.push(startDate);
    }
    if (endDate) {
      where.push("createdAt <= ?");
      args.push(endDate);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rowsResult, totalResult, byUtmResult] = await Promise.all([
      db.execute({
        sql: `SELECT id, shop, appName, path, utm, referer, createdAt
              FROM AppVisitSource
              ${whereSql}
              ORDER BY createdAt DESC
              LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS total FROM AppVisitSource ${whereSql}`,
        args,
      }),
      db.execute({
        sql: `SELECT utm, COUNT(*) AS visits, COUNT(DISTINCT shop) AS shopCount
              FROM AppVisitSource
              ${whereSql}
              GROUP BY utm
              ORDER BY visits DESC`,
        args,
      }),
    ]);

    res.json({
      visits: rowsResult.rows.map((r) => ({
        id: r.id,
        shop: r.shop,
        appName: r.appName,
        path: r.path,
        utm: r.utm,
        referer: r.referer ?? null,
        createdAt: r.createdAt,
      })),
      total: Number(totalResult.rows[0]?.total ?? 0),
      byUtm: byUtmResult.rows.map((r) => ({
        utm: r.utm,
        visits: Number(r.visits ?? 0),
        shopCount: Number(r.shopCount ?? 0),
      })),
    });
  } catch (err) {
    console.error("[visit-source]", err);
    res.status(500).json({ error: String(err) });
  }
});
