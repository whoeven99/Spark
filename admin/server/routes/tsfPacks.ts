import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfPacksRouter = Router();

/** 翻译加购流量包记录：BillingLog(TOKEN_PACK_PURCHASED) × PlanCatalog。 */
tsfPacksRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = (req.query.shop as string | undefined)?.trim() ?? "";
    const planKey = (req.query.plan as string | undefined)?.trim() ?? "";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["bl.eventType = 'TOKEN_PACK_PURCHASED'"];
    const args: (string | number)[] = [];

    if (shop) { conditions.push("bl.shop LIKE ?"); args.push(`%${shop}%`); }
    if (planKey) { conditions.push("bl.planKey = ?"); args.push(planKey); }
    if (startDate) { conditions.push("bl.createdAt >= ?"); args.push(startDate); }
    if (endDate) { conditions.push("bl.createdAt <= ?"); args.push(`${endDate}T23:59:59`); }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const fromClause = `
      FROM BillingLog bl
      LEFT JOIN PlanCatalog pc ON bl.planKey = pc.planKey
      ${where}
    `;

    const [statsResult, countResult, listResult, planOptionsResult] = await Promise.all([
      db.execute({
        sql: `
          SELECT
            COUNT(*) as totalPurchases,
            COUNT(DISTINCT bl.shop) as shopCount,
            COALESCE(SUM(bl.creditsDelta), 0) as totalCreditsGranted,
            COALESCE(SUM(CAST(pc.priceAmount AS REAL)), 0) as totalRevenue
          ${fromClause}
        `,
        args,
      }),
      args.length
        ? db.execute({ sql: `SELECT COUNT(*) as total ${fromClause}`, args })
        : db.execute(`SELECT COUNT(*) as total ${fromClause}`),
      args.length
        ? db.execute({
            sql: `
              SELECT bl.shop, bl.planKey, bl.referenceId, bl.creditsDelta,
                     bl.usedCredits, bl.createdAt,
                     pc.displayName, pc.credits as planCredits,
                     pc.priceAmount, pc.currencyCode
              ${fromClause}
              ORDER BY bl.createdAt DESC
              LIMIT ? OFFSET ?
            `,
            args: [...args, pageSize, offset],
          })
        : db.execute(
            `SELECT bl.shop, bl.planKey, bl.referenceId, bl.creditsDelta,
                    bl.usedCredits, bl.createdAt,
                    pc.displayName, pc.credits as planCredits,
                    pc.priceAmount, pc.currencyCode
             ${fromClause}
             ORDER BY bl.createdAt DESC
             LIMIT ${pageSize} OFFSET ${offset}`,
          ),
      db.execute(`
        SELECT bl.planKey, pc.displayName, COUNT(*) as count
        FROM BillingLog bl
        LEFT JOIN PlanCatalog pc ON bl.planKey = pc.planKey
        WHERE bl.eventType = 'TOKEN_PACK_PURCHASED'
        GROUP BY bl.planKey
        ORDER BY count DESC
      `),
    ]);

    const statsRow = statsResult.rows[0] ?? {};

    res.json({
      stats: {
        totalPurchases: Number(statsRow.totalPurchases ?? 0),
        shopCount: Number(statsRow.shopCount ?? 0),
        totalCreditsGranted: Number(statsRow.totalCreditsGranted ?? 0),
        totalRevenue: Number(statsRow.totalRevenue ?? 0),
      },
      total: Number(countResult.rows[0]?.total ?? 0),
      purchases: listResult.rows.map((r) => ({
        shop: r.shop as string,
        planKey: (r.planKey as string | null) ?? null,
        displayName: (r.displayName as string | null) ?? null,
        referenceId: (r.referenceId as string | null) ?? null,
        creditsDelta: Number(r.creditsDelta ?? 0),
        planCredits: Number(r.planCredits ?? 0),
        usedCredits: Number(r.usedCredits ?? 0),
        priceAmount: Number(r.priceAmount ?? 0),
        currencyCode: (r.currencyCode as string | null) ?? "USD",
        createdAt: r.createdAt as string,
      })),
      planOptions: planOptionsResult.rows.map((r) => ({
        planKey: (r.planKey as string | null) ?? null,
        displayName: (r.displayName as string | null) ?? null,
        count: Number(r.count ?? 0),
      })),
    });
  } catch (err) {
    console.error("[tsf/packs]", err);
    res.status(500).json({ error: String(err) });
  }
});
