import { Router } from "express";
import { getDb } from "../lib/db.js";

export const usageRouter = Router();

usageRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const sql = `
      SELECT
        a.shop,
        a.subscriptionTokens,
        a.purchasedTokens,
        a.usedTokens,
        a.updatedAt,
        sub.planKey,
        sub.status AS subStatus,
        sub.currentPeriodEnd
      FROM Account a
      LEFT JOIN AppSubscription sub
        ON a.shop = sub.shop
      ${search ? "WHERE a.shop LIKE ?" : ""}
      ORDER BY a.usedTokens DESC
      LIMIT 200
    `;

    const result = search
      ? await db.execute({ sql, args: [`%${search}%`] })
      : await db.execute(sql);

    const rows = result.rows.map((r) => {
      const sub = Number(r.subscriptionTokens ?? 0);
      const purchased = Number(r.purchasedTokens ?? 0);
      const used = Number(r.usedTokens ?? 0);
      const total = sub + purchased;
      return {
        shop: r.shop,
        appName: "spark",
        subscriptionTokens: sub,
        purchasedTokens: purchased,
        usedTokens: used,
        totalTokens: total,
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
        remainingTokens: Math.max(0, total - used),
        updatedAt: r.updatedAt,
        planKey: r.planKey ?? null,
        subStatus: r.subStatus ?? null,
        currentPeriodEnd: r.currentPeriodEnd ?? null,
      };
    });

    res.json({ usage: rows });
  } catch (err) {
    console.error("[usage]", err);
    res.status(500).json({ error: String(err) });
  }
});

usageRouter.get("/:shop/history", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;

    const result = await db.execute({
      sql: `
        SELECT periodStart, periodEnd, usedTokens, subscriptionTokensAllocated,
               purchasedTokensRemaining, planKey, archivedAt
        FROM AccountPeriodUsage
        WHERE shop = ?
        ORDER BY periodEnd DESC
        LIMIT 12
      `,
      args: [shop],
    });

    res.json({ history: result.rows });
  } catch (err) {
    console.error("[usage/history]", err);
    res.status(500).json({ error: String(err) });
  }
});
