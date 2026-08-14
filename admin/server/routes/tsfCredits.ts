import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AdminRole } from "../middleware/auth.js";
import { getTsfDb } from "../lib/tsfDb.js";
import { normalizeShopName } from "../lib/shopSession.js";

export const tsfCreditsRouter = Router();

/** 运维调整加购额度的流水事件（不计入 TOKEN_PACK_PURCHASED 收入/加购统计）。 */
const ADMIN_PURCHASED_EVENT = "ADMIN_PURCHASED_CREDITS_ADJUSTED";

/** 从输入解析商店域名：支持短名、完整域名或粘贴的 URL。 */
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
 * 按 shop 查询 TSF Turso 额度与加购积分。
 * GET /api/tsf/credits?shop=
 */
tsfCreditsRouter.get("/", async (req, res) => {
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
    const db = getTsfDb();
    const [accountResult, packResult, billingResult, historyResult] = await Promise.all([
      db.execute({
        sql: `
          SELECT
            a.shop,
            a.subscriptionCredits,
            a.purchasedCredits,
            a.trialCredits,
            a.usedCredits,
            a.deletedAt,
            a.createdAt,
            a.updatedAt,
            sub.planKey,
            sub.status AS subStatus,
            sub.billingInterval,
            sub.currentPeriodEnd,
            sub.trialEndsAt
          FROM Account a
          LEFT JOIN AppSubscription sub ON a.shop = sub.shop
          WHERE a.shop = ?
          LIMIT 1
        `,
        args: [shop],
      }),
      db.execute({
        sql: `
          SELECT
            bl.shop, bl.planKey, bl.referenceId, bl.creditsDelta,
            bl.usedCredits, bl.createdAt,
            pc.displayName, pc.credits AS planCredits,
            pc.priceAmount, pc.currencyCode
          FROM BillingLog bl
          LEFT JOIN PlanCatalog pc ON bl.planKey = pc.planKey
          WHERE bl.shop = ? AND bl.eventType = 'TOKEN_PACK_PURCHASED'
          ORDER BY bl.createdAt DESC
          LIMIT 100
        `,
        args: [shop],
      }),
      db.execute({
        sql: `
          SELECT shop, eventType, planKey, referenceId, creditsDelta, usedCredits, metadata, createdAt
          FROM BillingLog
          WHERE shop = ?
          ORDER BY createdAt DESC
          LIMIT 100
        `,
        args: [shop],
      }),
      db.execute({
        sql: `
          SELECT periodStart, periodEnd, usedCredits, subscriptionCreditsAllocated,
                 purchasedCreditsRemaining, trialCreditsRemaining, planKey, archivedAt
          FROM AccountPeriodUsage
          WHERE shop = ?
          ORDER BY periodEnd DESC
          LIMIT 12
        `,
        args: [shop],
      }),
    ]);

    const row = accountResult.rows[0];
    let account: Record<string, unknown> | null = null;

    if (row) {
      const subscriptionCredits = Number(row.subscriptionCredits ?? 0);
      const purchasedCredits = Number(row.purchasedCredits ?? 0);
      const trialCredits = Number(row.trialCredits ?? 0);
      const usedCredits = Number(row.usedCredits ?? 0);
      const totalCredits = subscriptionCredits + purchasedCredits + trialCredits;

      account = {
        shop: row.shop as string,
        subscriptionCredits,
        purchasedCredits,
        trialCredits,
        usedCredits,
        totalCredits,
        remainingCredits: Math.max(0, totalCredits - usedCredits),
        usagePercent: totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0,
        deletedAt: (row.deletedAt as string | null) ?? null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        installed: row.deletedAt == null,
        planKey: (row.planKey as string | null) ?? null,
        subStatus: (row.subStatus as string | null) ?? null,
        billingInterval: (row.billingInterval as string | null) ?? null,
        currentPeriodEnd: (row.currentPeriodEnd as string | null) ?? null,
        trialEndsAt: (row.trialEndsAt as string | null) ?? null,
      };
    }

    const packPurchases = packResult.rows.map((r) => ({
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
    }));

    const packStats = {
      totalPurchases: packPurchases.length,
      totalCreditsGranted: packPurchases.reduce((sum, p) => sum + p.creditsDelta, 0),
    };

    const billingLogs = billingResult.rows.map((r) => ({
      shop: r.shop as string,
      eventType: r.eventType as string,
      planKey: (r.planKey as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      creditsDelta: Number(r.creditsDelta ?? 0),
      usedCredits: Number(r.usedCredits ?? 0),
      metadata: parseBillingMetadata(r.metadata),
      createdAt: r.createdAt as string,
    }));

    const adminAdjustments = billingLogs.filter(
      (log) => log.eventType === ADMIN_PURCHASED_EVENT,
    );

    const periodHistory = historyResult.rows.map((r) => ({
      periodStart: r.periodStart as string,
      periodEnd: r.periodEnd as string,
      usedCredits: Number(r.usedCredits ?? 0),
      subscriptionCreditsAllocated: Number(r.subscriptionCreditsAllocated ?? 0),
      purchasedCreditsRemaining: Number(r.purchasedCreditsRemaining ?? 0),
      trialCreditsRemaining: Number(r.trialCreditsRemaining ?? 0),
      planKey: (r.planKey as string | null) ?? null,
      archivedAt: r.archivedAt as string,
    }));

    res.json({
      queriedShop: shop,
      account,
      packPurchases,
      packStats,
      billingLogs,
      adminAdjustments,
      periodHistory,
    });
  } catch (err) {
    console.error("[tsf/credits]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 调整 Account.purchasedCredits。
 * POST /api/tsf/credits/purchased
 * body: { shop, action: "add" | "set", amount, note? }
 */
tsfCreditsRouter.post("/purchased", async (req, res) => {
  const shop = resolveShopQuery(String(req.body?.shop ?? ""));
  const actionRaw = String(req.body?.action ?? "").trim().toLowerCase();
  const action = actionRaw === "add" || actionRaw === "set" ? actionRaw : null;
  const amount = parseIntegerAmount(req.body?.amount);
  const note =
    typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  const operatorRole = (res.locals.adminRole as AdminRole | undefined) ?? "user";

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
    const db = getTsfDb();
    const accountResult = await db.execute({
      sql: `
        SELECT shop, purchasedCredits, usedCredits, updatedAt
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

    const before = Number(row.purchasedCredits ?? 0);
    const usedCredits = Number(row.usedCredits ?? 0);
    const after = action === "add" ? before + amount : amount;
    if (after < 0) {
      res.status(400).json({
        error: `结果额度不能为负（当前 ${before}，调整后 ${after}）`,
      });
      return;
    }

    const creditsDelta = after - before;
    if (creditsDelta === 0) {
      res.json({
        shop,
        action,
        before,
        after,
        creditsDelta: 0,
        note: "unchanged",
      });
      return;
    }

    const now = new Date().toISOString();
    const logId = randomUUID();
    const referenceId = `admin-purchased-${logId}`;
    const metadata = JSON.stringify({
      source: "spark-admin",
      action,
      before,
      after,
      amount,
      note: note || null,
      adjustedAt: now,
      operatorRole,
    });

    await db.batch(
      [
        {
          sql: `
            UPDATE Account
            SET purchasedCredits = ?, updatedAt = ?
            WHERE shop = ?
          `,
          args: [after, now, shop],
        },
        {
          sql: `
            INSERT INTO BillingLog
              (id, shop, eventType, planKey, referenceId, creditsDelta, usedCredits, metadata, createdAt)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
          `,
          args: [
            logId,
            shop,
            ADMIN_PURCHASED_EVENT,
            referenceId,
            creditsDelta,
            usedCredits,
            metadata,
            now,
          ],
        },
      ],
      "write",
    );

    console.info(
      `[tsf/credits/purchased] shop=${shop} action=${action} ` +
        `before=${before} after=${after} delta=${creditsDelta} ` +
        `operator=${operatorRole} ref=${referenceId}`,
    );

    res.json({
      shop,
      action,
      before,
      after,
      creditsDelta,
      referenceId,
      eventType: ADMIN_PURCHASED_EVENT,
      logId,
    });
  } catch (err) {
    console.error("[tsf/credits/purchased]", err);
    res.status(500).json({ error: String(err) });
  }
});
