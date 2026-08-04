import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfShopsRouter = Router();

/** TSF 新用户列表：以 Account 为主表，联 AppSubscription。 */
tsfShopsRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const baseQuery = `
      SELECT
        a.shop,
        a.createdAt  AS boundAt,
        a.subscriptionCredits,
        a.purchasedCredits,
        a.trialCredits,
        a.usedCredits,
        a.deletedAt,
        a.createdAt  AS accountCreatedAt,
        a.updatedAt  AS accountUpdatedAt,
        sub.planKey,
        sub.status   AS subStatus,
        sub.billingInterval,
        sub.currentPeriodEnd,
        (SELECT COUNT(*) FROM Session s WHERE s.shop = a.shop) AS sessionCount
      FROM Account a
      LEFT JOIN AppSubscription sub ON a.shop = sub.shop
      ${search ? "WHERE a.shop LIKE ?" : ""}
      ORDER BY a.createdAt DESC
      LIMIT 200
    `;

    const result = search
      ? await db.execute({ sql: baseQuery, args: [`%${search}%`] })
      : await db.execute(baseQuery);

    const shops = result.rows.map((r) => ({
      shop: r.shop,
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
      installed: r.deletedAt == null,
      sessionCount: Number(r.sessionCount ?? 0),
    }));

    res.json({ shops });
  } catch (err) {
    console.error("[tsf/shops]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 单店详情：Account + 计费流水（TSF 无 CommonEventLog / ShopBillingBinding）。 */
tsfShopsRouter.get("/:shop/events", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = req.params.shop;

    const [accountResult, billingResult] = await Promise.all([
      db.execute({
        sql: "SELECT shop, deletedAt, createdAt, updatedAt FROM Account WHERE shop = ?",
        args: [shop],
      }),
      db.execute({
        sql: `SELECT shop, eventType, planKey, referenceId, creditsDelta, usedCredits, createdAt
              FROM BillingLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 50`,
        args: [shop],
      }),
    ]);

    const accountRow = accountResult.rows[0] ?? null;

    res.json({
      account: accountRow
        ? {
            shop: accountRow.shop,
            deletedAt: accountRow.deletedAt ?? null,
            createdAt: accountRow.createdAt,
            updatedAt: accountRow.updatedAt,
            installed: accountRow.deletedAt == null,
          }
        : null,
      /** @deprecated 兼容旧前端字段名；等于 account */
      binding: accountRow
        ? {
            shop: accountRow.shop,
            billingSystem: "tsf",
            boundReason: null,
            createdAt: accountRow.createdAt,
            updatedAt: accountRow.updatedAt,
          }
        : null,
      billingLogs: billingResult.rows,
    });
  } catch (err) {
    console.error("[tsf/shops/events]", err);
    res.status(500).json({ error: String(err) });
  }
});
