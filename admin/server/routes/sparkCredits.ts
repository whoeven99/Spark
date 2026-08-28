import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AdminRole } from "../middleware/auth.js";
import { getDb, isSparkDbConfigured } from "../lib/db.js";
import { normalizeShopName } from "../lib/shopSession.js";

export const sparkCreditsRouter = Router();

/** 与主应用 `BILLING_LOG_EVENT.SYSTEM_REWARD` 一致；入账 purchasedTokens。 */
const SYSTEM_REWARD_EVENT = "SYSTEM_REWARD";

function resolveShopQuery(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? value;
  return normalizeShopName(value);
}

function parseIntegerAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
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
 * 按 shop 查询 Spark Account 额度与 BillingLog。
 * GET /api/spark-credits?shop=
 */
sparkCreditsRouter.get("/", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const rawShop = (req.query.shop as string | undefined)?.trim() ?? "";
  if (!rawShop) {
    res.status(400).json({ error: "shop query parameter is required" });
    return;
  }

  const shop = resolveShopQuery(rawShop);
  if (!shop) {
    res.status(400).json({ error: "无效的商店域名" });
    return;
  }

  try {
    const db = getDb();
    const [accountResult, billingResult, historyResult, rewardResult] =
      await Promise.all([
        db.execute({
          sql: `
            SELECT
              a.shop,
              a.subscriptionTokens,
              a.purchasedTokens,
              a.usedTokens,
              a.createdAt,
              a.updatedAt,
              sub.planKey,
              sub.status AS subStatus,
              sub.billingInterval,
              sub.currentPeriodEnd
            FROM Account a
            LEFT JOIN AppSubscription sub ON a.shop = sub.shop
            WHERE a.shop = ?
            LIMIT 1
          `,
          args: [shop],
        }),
        db.execute({
          sql: `
            SELECT shop, eventType, planKey, referenceId, tokensDelta, usedTokens, metadata, createdAt
            FROM BillingLog
            WHERE shop = ?
            ORDER BY createdAt DESC
            LIMIT 100
          `,
          args: [shop],
        }),
        db.execute({
          sql: `
            SELECT periodStart, periodEnd, usedTokens, subscriptionTokensAllocated,
                   purchasedTokensRemaining, planKey, archivedAt
            FROM AccountPeriodUsage
            WHERE shop = ?
            ORDER BY periodEnd DESC
            LIMIT 12
          `,
          args: [shop],
        }),
        db.execute({
          sql: `
            SELECT shop, eventType, planKey, referenceId, tokensDelta, usedTokens, metadata, createdAt
            FROM BillingLog
            WHERE shop = ? AND eventType = ?
            ORDER BY createdAt DESC
            LIMIT 50
          `,
          args: [shop, SYSTEM_REWARD_EVENT],
        }),
      ]);

    const row = accountResult.rows[0];
    let account: Record<string, unknown> | null = null;

    if (row) {
      const subscriptionTokens = Number(row.subscriptionTokens ?? 0);
      const purchasedTokens = Number(row.purchasedTokens ?? 0);
      const usedTokens = Number(row.usedTokens ?? 0);
      const totalTokens = subscriptionTokens + purchasedTokens;

      account = {
        shop: row.shop as string,
        subscriptionTokens,
        purchasedTokens,
        usedTokens,
        totalTokens,
        remainingTokens: Math.max(0, totalTokens - usedTokens),
        usagePercent:
          totalTokens > 0 ? Math.round((usedTokens / totalTokens) * 100) : 0,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        planKey: (row.planKey as string | null) ?? null,
        subStatus: (row.subStatus as string | null) ?? null,
        billingInterval: (row.billingInterval as string | null) ?? null,
        currentPeriodEnd: (row.currentPeriodEnd as string | null) ?? null,
      };
    }

    const mapLog = (r: (typeof billingResult.rows)[number]) => ({
      shop: r.shop as string,
      eventType: r.eventType as string,
      planKey: (r.planKey as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      tokensDelta: Number(r.tokensDelta ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      metadata: parseBillingMetadata(r.metadata),
      createdAt: r.createdAt as string,
    });

    const billingLogs = billingResult.rows.map(mapLog);
    const systemRewards = rewardResult.rows.map(mapLog);

    const periodHistory = historyResult.rows.map((r) => ({
      periodStart: r.periodStart as string,
      periodEnd: r.periodEnd as string,
      usedTokens: Number(r.usedTokens ?? 0),
      subscriptionTokensAllocated: Number(r.subscriptionTokensAllocated ?? 0),
      purchasedTokensRemaining: Number(r.purchasedTokensRemaining ?? 0),
      planKey: (r.planKey as string | null) ?? null,
      archivedAt: r.archivedAt as string,
    }));

    res.json({
      queriedShop: shop,
      account,
      billingLogs,
      systemRewards,
      periodHistory,
    });
  } catch (err) {
    console.error("[spark-credits]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 调整 Account.purchasedTokens，并写 SYSTEM_REWARD BillingLog。
 * POST /api/spark-credits/reward
 * body: { shop, action: "add" | "set", amount, note? }
 */
sparkCreditsRouter.post("/reward", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const shop = resolveShopQuery(String(req.body?.shop ?? ""));
  const actionRaw = String(req.body?.action ?? "").trim().toLowerCase();
  const action = actionRaw === "add" || actionRaw === "set" ? actionRaw : null;
  const amount = parseIntegerAmount(req.body?.amount);
  const note =
    typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  const operatorRole = (res.locals.adminRole as AdminRole | undefined) ?? "user";
  const operatorId =
    typeof res.locals.adminUserId === "string" ? res.locals.adminUserId : null;
  const operatorLabel =
    typeof res.locals.adminUserLabel === "string"
      ? res.locals.adminUserLabel
      : null;

  if (!shop) {
    res.status(400).json({ error: "shop is required" });
    return;
  }
  if (!action) {
    res.status(400).json({ error: 'action must be "add" or "set"' });
    return;
  }
  if (amount == null) {
    res.status(400).json({ error: "amount must be an integer" });
    return;
  }
  if (action === "set" && amount < 0) {
    res.status(400).json({ error: "set amount must be >= 0" });
    return;
  }
  if (action === "add" && amount === 0) {
    res.status(400).json({ error: "add amount must not be 0" });
    return;
  }

  try {
    const db = getDb();
    const accountResult = await db.execute({
      sql: `
        SELECT shop, purchasedTokens, usedTokens, updatedAt
        FROM Account
        WHERE shop = ?
        LIMIT 1
      `,
      args: [shop],
    });
    const row = accountResult.rows[0];
    if (!row) {
      res.status(404).json({ error: `Account not found: ${shop}` });
      return;
    }

    const before = Number(row.purchasedTokens ?? 0);
    const usedTokens = Number(row.usedTokens ?? 0);
    const after = action === "add" ? before + amount : amount;
    if (after < 0) {
      res.status(400).json({
        error: `结果额度不能为负（当前 ${before}，调整后 ${after}）`,
      });
      return;
    }

    const tokensDelta = after - before;
    if (tokensDelta === 0) {
      res.json({
        shop,
        action,
        before,
        after,
        tokensDelta: 0,
        note: "unchanged",
      });
      return;
    }

    const now = new Date().toISOString();
    const logId = randomUUID();
    const referenceId = `system-reward-${logId}`;
    const metadata = JSON.stringify({
      source: "spark-admin",
      action,
      before,
      after,
      amount,
      note: note || null,
      adjustedAt: now,
      operatorRole,
      operatorId,
      operatorLabel,
    });

    await db.batch(
      [
        {
          sql: `
            UPDATE Account
            SET purchasedTokens = ?, updatedAt = ?
            WHERE shop = ?
          `,
          args: [after, now, shop],
        },
        {
          sql: `
            INSERT INTO BillingLog
              (id, shop, eventType, planKey, referenceId, tokensDelta, usedTokens, metadata, createdAt)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
          `,
          args: [
            logId,
            shop,
            SYSTEM_REWARD_EVENT,
            referenceId,
            tokensDelta,
            usedTokens,
            metadata,
            now,
          ],
        },
      ],
      "write",
    );

    console.info(
      `[spark-credits/reward] shop=${shop} action=${action} ` +
        `before=${before} after=${after} delta=${tokensDelta} ` +
        `operator=${operatorLabel ?? operatorRole} ref=${referenceId}`,
    );

    res.json({
      shop,
      action,
      before,
      after,
      tokensDelta,
      referenceId,
      eventType: SYSTEM_REWARD_EVENT,
      logId,
    });
  } catch (err) {
    console.error("[spark-credits/reward]", err);
    res.status(500).json({ error: String(err) });
  }
});
