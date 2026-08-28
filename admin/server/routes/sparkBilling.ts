import { Router } from "express";
import { getDb, isSparkDbConfigured } from "../lib/db.js";
import { normalizeShopName } from "../lib/shopSession.js";

export const sparkBillingRouter = Router();

function clampDays(value: unknown): number {
  const days = Number(value ?? 30);
  if (!Number.isFinite(days)) return 30;
  return Math.min(365, Math.max(1, Math.floor(days)));
}

function startIsoForDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function resolveShopQuery(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? value;
  return normalizeShopName(value);
}

function parseBillingMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * GET /api/spark-billing/overview?days=30
 * 近 N 天 BillingLog 汇总 + 最近流水 + 低余额店。
 */
sparkBillingRouter.get("/overview", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const days = clampDays(req.query.days);
  const since = startIsoForDays(days);

  try {
    const db = getDb();
    const [
      activeSubResult,
      eventStatsResult,
      recentEventsResult,
      lowBalanceResult,
      rewardSumResult,
    ] = await Promise.all([
      db.execute(
        `SELECT COUNT(*) as count FROM AppSubscription WHERE status = 'ACTIVE'`,
      ),
      db.execute({
        sql: `
          SELECT eventType, COUNT(*) as count,
                 COALESCE(SUM(tokensDelta), 0) as tokensSum
          FROM BillingLog
          WHERE createdAt >= ?
          GROUP BY eventType
          ORDER BY count DESC
        `,
        args: [since],
      }),
      db.execute({
        sql: `
          SELECT shop, eventType, planKey, referenceId, tokensDelta, usedTokens, metadata, createdAt
          FROM BillingLog
          WHERE createdAt >= ?
          ORDER BY createdAt DESC
          LIMIT 50
        `,
        args: [since],
      }),
      db.execute(`
        SELECT a.shop,
               a.subscriptionTokens, a.purchasedTokens, a.usedTokens,
               sub.planKey, sub.status AS subStatus
        FROM Account a
        LEFT JOIN AppSubscription sub ON a.shop = sub.shop
        WHERE (a.subscriptionTokens + a.purchasedTokens) > 0
          AND CAST(a.usedTokens AS REAL) * 100.0
              / (a.subscriptionTokens + a.purchasedTokens) >= 85
        ORDER BY CAST(a.usedTokens AS REAL)
              / (a.subscriptionTokens + a.purchasedTokens) DESC
        LIMIT 20
      `),
      db.execute({
        sql: `
          SELECT COUNT(*) as count, COALESCE(SUM(tokensDelta), 0) as tokensSum
          FROM BillingLog
          WHERE eventType = 'SYSTEM_REWARD' AND createdAt >= ?
        `,
        args: [since],
      }),
    ]);

    const byEventType = eventStatsResult.rows.map((r) => ({
      eventType: r.eventType as string,
      count: Number(r.count ?? 0),
      tokensSum: Number(r.tokensSum ?? 0),
    }));

    const recentBillingEvents = recentEventsResult.rows.map((r) => ({
      shop: r.shop as string,
      eventType: r.eventType as string,
      planKey: (r.planKey as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      tokensDelta: Number(r.tokensDelta ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      metadata: parseBillingMetadata(r.metadata),
      createdAt: r.createdAt as string,
    }));

    const lowBalanceShops = lowBalanceResult.rows.map((r) => {
      const subscriptionTokens = Number(r.subscriptionTokens ?? 0);
      const purchasedTokens = Number(r.purchasedTokens ?? 0);
      const usedTokens = Number(r.usedTokens ?? 0);
      const total = subscriptionTokens + purchasedTokens;
      return {
        shop: r.shop as string,
        planKey: (r.planKey as string | null) ?? null,
        subStatus: (r.subStatus as string | null) ?? null,
        subscriptionTokens,
        purchasedTokens,
        usedTokens,
        totalTokens: total,
        remainingTokens: Math.max(0, total - usedTokens),
        usagePercent: total > 0 ? Math.round((usedTokens / total) * 100) : 0,
      };
    });

    res.json({
      days,
      since,
      summary: {
        activeSubscriptions: Number(activeSubResult.rows[0]?.count ?? 0),
        billingEvents: byEventType.reduce((s, e) => s + e.count, 0),
        systemRewardCount: Number(rewardSumResult.rows[0]?.count ?? 0),
        systemRewardTokens: Number(rewardSumResult.rows[0]?.tokensSum ?? 0),
        lowBalanceShops: lowBalanceShops.length,
      },
      byEventType,
      recentBillingEvents,
      lowBalanceShops,
    });
  } catch (err) {
    console.error("[spark-billing/overview]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/spark-billing/ledger?shop=&days=30&eventType=
 * 单店或全库 BillingLog 流水。
 */
sparkBillingRouter.get("/ledger", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const days = clampDays(req.query.days);
  const since = startIsoForDays(days);
  const rawShop = (req.query.shop as string | undefined)?.trim() ?? "";
  const eventType = (req.query.eventType as string | undefined)?.trim() ?? "";
  const shop = rawShop ? resolveShopQuery(rawShop) : "";

  if (rawShop && !shop) {
    res.status(400).json({ error: "无效的商店域名" });
    return;
  }

  try {
    const db = getDb();
    const conditions = ["createdAt >= ?"];
    const args: Array<string | number> = [since];

    if (shop) {
      conditions.push("shop = ?");
      args.push(shop);
    }
    if (eventType) {
      conditions.push("eventType = ?");
      args.push(eventType);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const [eventsResult, accountResult] = await Promise.all([
      db.execute({
        sql: `
          SELECT shop, eventType, planKey, referenceId, tokensDelta, usedTokens, metadata, createdAt
          FROM BillingLog
          ${where}
          ORDER BY createdAt DESC
          LIMIT 200
        `,
        args,
      }),
      shop
        ? db.execute({
            sql: `
              SELECT a.shop, a.subscriptionTokens, a.purchasedTokens, a.usedTokens,
                     sub.planKey, sub.status AS subStatus, sub.billingInterval, sub.currentPeriodEnd
              FROM Account a
              LEFT JOIN AppSubscription sub ON a.shop = sub.shop
              WHERE a.shop = ?
              LIMIT 1
            `,
            args: [shop],
          })
        : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    ]);

    const events = eventsResult.rows.map((r) => ({
      shop: r.shop as string,
      eventType: r.eventType as string,
      planKey: (r.planKey as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      tokensDelta: Number(r.tokensDelta ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      metadata: parseBillingMetadata(r.metadata),
      createdAt: r.createdAt as string,
    }));

    let account: Record<string, unknown> | null = null;
    const row = accountResult.rows[0];
    if (row) {
      const subscriptionTokens = Number(row.subscriptionTokens ?? 0);
      const purchasedTokens = Number(row.purchasedTokens ?? 0);
      const usedTokens = Number(row.usedTokens ?? 0);
      const total = subscriptionTokens + purchasedTokens;
      account = {
        shop: row.shop as string,
        subscriptionTokens,
        purchasedTokens,
        usedTokens,
        totalTokens: total,
        remainingTokens: Math.max(0, total - usedTokens),
        usagePercent: total > 0 ? Math.round((usedTokens / total) * 100) : 0,
        planKey: (row.planKey as string | null) ?? null,
        subStatus: (row.subStatus as string | null) ?? null,
        billingInterval: (row.billingInterval as string | null) ?? null,
        currentPeriodEnd: (row.currentPeriodEnd as string | null) ?? null,
      };
    }

    res.json({
      days,
      since,
      shop: shop || null,
      eventType: eventType || null,
      account,
      events,
    });
  } catch (err) {
    console.error("[spark-billing/ledger]", err);
    res.status(500).json({ error: String(err) });
  }
});
