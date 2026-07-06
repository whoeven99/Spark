import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfShopsRouter = Router();

/** TSF 新用户列表：以 ShopBillingBinding(tsf) 为主表，联 Account / AppSubscription。 */
tsfShopsRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const baseQuery = `
      SELECT
        b.shop,
        b.boundReason,
        b.createdAt  AS boundAt,
        a.subscriptionCredits,
        a.purchasedCredits,
        a.trialCredits,
        a.usedCredits,
        a.createdAt  AS accountCreatedAt,
        a.updatedAt  AS accountUpdatedAt,
        sub.planKey,
        sub.status   AS subStatus,
        sub.billingInterval,
        sub.currentPeriodEnd,
        (SELECT COUNT(*) FROM Session s WHERE s.shop = b.shop) AS sessionCount
      FROM ShopBillingBinding b
      LEFT JOIN Account a ON b.shop = a.shop
      LEFT JOIN AppSubscription sub ON b.shop = sub.shop
      WHERE b.billingSystem = 'tsf'
      ${search ? "AND b.shop LIKE ?" : ""}
      ORDER BY b.createdAt DESC
      LIMIT 200
    `;

    const result = search
      ? await db.execute({ sql: baseQuery, args: [`%${search}%`] })
      : await db.execute(baseQuery);

    const shops = result.rows.map((r) => ({
      shop: r.shop,
      boundReason: r.boundReason ?? null,
      boundAt: r.boundAt,
      subscriptionCredits: Number(r.subscriptionCredits ?? 0),
      purchasedCredits: Number(r.purchasedCredits ?? 0),
      trialCredits: Number(r.trialCredits ?? 0),
      usedCredits: Number(r.usedCredits ?? 0),
      accountCreatedAt: r.accountCreatedAt ?? null,
      accountUpdatedAt: r.accountUpdatedAt ?? null,
      planKey: r.planKey ?? null,
      subStatus: r.subStatus ?? null,
      billingInterval: r.billingInterval ?? null,
      currentPeriodEnd: r.currentPeriodEnd ?? null,
      installed: Number(r.sessionCount ?? 0) > 0,
    }));

    res.json({ shops });
  } catch (err) {
    console.error("[tsf/shops]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 单店详情：绑定信息 + 计费流水（TSF 无 CommonEventLog）。 */
tsfShopsRouter.get("/:shop/events", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = req.params.shop;

    const [bindingResult, billingResult] = await Promise.all([
      db.execute({
        sql: "SELECT shop, billingSystem, boundReason, createdAt, updatedAt FROM ShopBillingBinding WHERE shop = ?",
        args: [shop],
      }),
      db.execute({
        sql: `SELECT shop, eventType, planKey, referenceId, creditsDelta, usedCredits, createdAt
              FROM BillingLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 50`,
        args: [shop],
      }),
    ]);

    res.json({
      binding: bindingResult.rows[0] ?? null,
      billingLogs: billingResult.rows,
    });
  } catch (err) {
    console.error("[tsf/shops/events]", err);
    res.status(500).json({ error: String(err) });
  }
});
