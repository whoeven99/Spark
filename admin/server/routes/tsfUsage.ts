import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfUsageRouter = Router();

/** TSF 新用户 Credits 用量（Account 仅 tsf 新用户有行）。 */
tsfUsageRouter.get("/account", async (req, res) => {
  const shop = (req.query.shop as string | undefined)?.trim();
  if (!shop) {
    res.status(400).json({ error: "shop query parameter is required" });
    return;
  }

  try {
    const db = getTsfDb();
    const result = await db.execute({
      sql: `
        SELECT
          a.shop,
          a.subscriptionCredits,
          a.purchasedCredits,
          a.trialCredits,
          a.usedCredits,
          a.updatedAt,
          sub.planKey,
          sub.status AS subStatus,
          sub.currentPeriodEnd
        FROM Account a
        LEFT JOIN AppSubscription sub ON a.shop = sub.shop
        WHERE a.shop = ?
        LIMIT 1
      `,
      args: [shop],
    });

    const r = result.rows[0];
    if (!r) {
      res.json({ account: null });
      return;
    }

    const sub = Number(r.subscriptionCredits ?? 0);
    const purchased = Number(r.purchasedCredits ?? 0);
    const trial = Number(r.trialCredits ?? 0);
    const used = Number(r.usedCredits ?? 0);
    const total = sub + purchased + trial;

    res.json({
      account: {
        shop: r.shop,
        subscriptionCredits: sub,
        purchasedCredits: purchased,
        trialCredits: trial,
        usedCredits: used,
        totalCredits: total,
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
        remainingCredits: Math.max(0, total - used),
        updatedAt: r.updatedAt,
        planKey: r.planKey ?? null,
        subStatus: r.subStatus ?? null,
        currentPeriodEnd: r.currentPeriodEnd ?? null,
      },
    });
  } catch (err) {
    console.error("[tsf/usage/account]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** TSF 新用户 Credits 用量（Account 仅 tsf 新用户有行）。 */
tsfUsageRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const sql = `
      SELECT
        a.shop,
        a.subscriptionCredits,
        a.purchasedCredits,
        a.trialCredits,
        a.usedCredits,
        a.updatedAt,
        sub.planKey,
        sub.status AS subStatus,
        sub.currentPeriodEnd
      FROM Account a
      LEFT JOIN AppSubscription sub ON a.shop = sub.shop
      ${search ? "WHERE a.shop LIKE ?" : ""}
      ORDER BY a.usedCredits DESC
      LIMIT 200
    `;

    const result = search
      ? await db.execute({ sql, args: [`%${search}%`] })
      : await db.execute(sql);

    const usage = result.rows.map((r) => {
      const sub = Number(r.subscriptionCredits ?? 0);
      const purchased = Number(r.purchasedCredits ?? 0);
      const trial = Number(r.trialCredits ?? 0);
      const used = Number(r.usedCredits ?? 0);
      const total = sub + purchased + trial;
      return {
        shop: r.shop,
        subscriptionCredits: sub,
        purchasedCredits: purchased,
        trialCredits: trial,
        usedCredits: used,
        totalCredits: total,
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
        remainingCredits: Math.max(0, total - used),
        updatedAt: r.updatedAt,
        planKey: r.planKey ?? null,
        subStatus: r.subStatus ?? null,
        currentPeriodEnd: r.currentPeriodEnd ?? null,
      };
    });

    res.json({ usage });
  } catch (err) {
    console.error("[tsf/usage]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 单店周期用量归档。 */
tsfUsageRouter.get("/:shop/history", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = req.params.shop;

    const result = await db.execute({
      sql: `
        SELECT periodStart, periodEnd, usedCredits, subscriptionCreditsAllocated,
               purchasedCreditsRemaining, trialCreditsRemaining, planKey, archivedAt
        FROM AccountPeriodUsage
        WHERE shop = ?
        ORDER BY periodEnd DESC
        LIMIT 12
      `,
      args: [shop],
    });

    res.json({ history: result.rows });
  } catch (err) {
    console.error("[tsf/usage/history]", err);
    res.status(500).json({ error: String(err) });
  }
});
