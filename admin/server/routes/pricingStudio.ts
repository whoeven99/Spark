import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getDb } from "../lib/db.js";
import { requireOwner } from "../middleware/auth.js";

export const pricingStudioRouter = Router();

const DEFAULT_SETTINGS = {
  payingShops: 100,
  targetGrossMarginPct: 70,
  planPriceUsd: 29.99,
  tokenGrantPerUser: 500000,
  blendedCostUsdPerMillionBilledToken: 2,
  shopifyRevSharePct: 15,
  paymentFeePct: 0,
};

async function ensureTables() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminPricingConfig (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminMonthlyFixedCost (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amountUsd REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
}

let tableReady: Promise<void> | null = null;

function readyTable() {
  if (!tableReady) {
    tableReady = ensureTables().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

async function readSettings() {
  const rows = await getDb().execute(
    "SELECT key, value FROM AdminPricingConfig WHERE key IN ('payingShops','targetGrossMarginPct','planPriceUsd','tokenGrantPerUser','blendedCostUsdPerMillionBilledToken','shopifyRevSharePct','paymentFeePct','usageScenariosJson')",
  );

  const map = new Map<string, string>();
  for (const row of rows.rows) {
    map.set(String(row.key), String(row.value));
  }

  let usageScenarios: unknown[] | null = null;
  const scenariosRaw = map.get("usageScenariosJson");
  if (scenariosRaw) {
    try {
      const parsed = JSON.parse(scenariosRaw);
      if (Array.isArray(parsed)) usageScenarios = parsed;
    } catch {
      usageScenarios = null;
    }
  }

  return {
    payingShops: Number(map.get("payingShops") ?? DEFAULT_SETTINGS.payingShops),
    targetGrossMarginPct: Number(
      map.get("targetGrossMarginPct") ?? DEFAULT_SETTINGS.targetGrossMarginPct,
    ),
    planPriceUsd: Number(map.get("planPriceUsd") ?? DEFAULT_SETTINGS.planPriceUsd),
    tokenGrantPerUser: Number(
      map.get("tokenGrantPerUser") ?? DEFAULT_SETTINGS.tokenGrantPerUser,
    ),
    blendedCostUsdPerMillionBilledToken: Number(
      map.get("blendedCostUsdPerMillionBilledToken") ??
        DEFAULT_SETTINGS.blendedCostUsdPerMillionBilledToken,
    ),
    shopifyRevSharePct: Number(
      map.get("shopifyRevSharePct") ?? DEFAULT_SETTINGS.shopifyRevSharePct,
    ),
    paymentFeePct: Number(
      map.get("paymentFeePct") ?? DEFAULT_SETTINGS.paymentFeePct,
    ),
    usageScenarios,
  };
}

async function readPlanCatalog() {
  const result = await getDb().execute(`
    SELECT planKey, appName, kind, billingInterval, displayName, tokens, priceAmount, currencyCode, enabled, sortOrder
    FROM PlanCatalog
    WHERE enabled = 1
    ORDER BY sortOrder ASC, planKey ASC
  `);
  return result.rows.map((row) => ({
    planKey: String(row.planKey),
    appName: String(row.appName),
    kind: String(row.kind),
    billingInterval: row.billingInterval != null ? String(row.billingInterval) : null,
    displayName: String(row.displayName),
    tokens: Number(row.tokens ?? 0),
    priceAmount: String(row.priceAmount),
    currencyCode: String(row.currencyCode ?? "USD"),
  }));
}

pricingStudioRouter.get("/", async (_req, res) => {
  try {
    await readyTable();
    const [settings, fixedCostsResult, plans] = await Promise.all([
      readSettings(),
      getDb().execute(
        "SELECT id, name, amountUsd, enabled, sortOrder, createdAt, updatedAt FROM AdminMonthlyFixedCost ORDER BY sortOrder ASC, createdAt ASC",
      ),
      readPlanCatalog().catch(() => []),
    ]);

    const fixedCosts = fixedCostsResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      amountUsd: Number(row.amountUsd ?? 0),
      enabled: Number(row.enabled) !== 0,
      sortOrder: Number(row.sortOrder ?? 0),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    }));

    res.json({ settings, fixedCosts, plans });
  } catch (err) {
    console.error("[pricing-studio GET]", err);
    res.status(500).json({ error: String(err) });
  }
});

pricingStudioRouter.put("/settings", requireOwner, async (req, res) => {
  try {
    await readyTable();
    const now = new Date().toISOString();
    const {
      payingShops,
      targetGrossMarginPct,
      planPriceUsd,
      tokenGrantPerUser,
      blendedCostUsdPerMillionBilledToken,
      shopifyRevSharePct,
      paymentFeePct,
      usageScenarios,
    } = req.body as Record<string, unknown>;

    const entries: Array<[string, number]> = [
      ["payingShops", Number(payingShops)],
      ["targetGrossMarginPct", Number(targetGrossMarginPct)],
      ["planPriceUsd", Number(planPriceUsd)],
      ["tokenGrantPerUser", Number(tokenGrantPerUser)],
      [
        "blendedCostUsdPerMillionBilledToken",
        Number(blendedCostUsdPerMillionBilledToken),
      ],
      ["shopifyRevSharePct", Number(shopifyRevSharePct ?? DEFAULT_SETTINGS.shopifyRevSharePct)],
      ["paymentFeePct", Number(paymentFeePct ?? DEFAULT_SETTINGS.paymentFeePct)],
    ];

    for (const [key, value] of entries) {
      if (!Number.isFinite(value) || value < 0) {
        res.status(400).json({ error: `Invalid value for ${key}` });
        return;
      }
    }

    if (
      Number(shopifyRevSharePct ?? DEFAULT_SETTINGS.shopifyRevSharePct) +
        Number(paymentFeePct ?? DEFAULT_SETTINGS.paymentFeePct) >=
      100
    ) {
      res.status(400).json({ error: "shopifyRevSharePct + paymentFeePct must be < 100" });
      return;
    }

    for (const [key, value] of entries) {
      await getDb().execute({
        sql: `
          INSERT INTO AdminPricingConfig (key, value, updatedAt)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updatedAt = excluded.updatedAt
        `,
        args: [key, String(value), now],
      });
    }

    if (usageScenarios !== undefined) {
      if (!Array.isArray(usageScenarios)) {
        res.status(400).json({ error: "usageScenarios must be an array" });
        return;
      }
      await getDb().execute({
        sql: `
          INSERT INTO AdminPricingConfig (key, value, updatedAt)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updatedAt = excluded.updatedAt
        `,
        args: ["usageScenariosJson", JSON.stringify(usageScenarios), now],
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[pricing-studio PUT settings]", err);
    res.status(500).json({ error: String(err) });
  }
});

pricingStudioRouter.post("/fixed-costs", requireOwner, async (req, res) => {
  try {
    await readyTable();
    const { name, amountUsd, enabled, sortOrder } = req.body as Record<string, unknown>;
    if (!name || String(name).trim().length === 0) {
      res.status(400).json({ error: "name required" });
      return;
    }

    const parsedAmount = Number(amountUsd);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: "amountUsd must be a non-negative number" });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await getDb().execute({
      sql: `
        INSERT INTO AdminMonthlyFixedCost
          (id, name, amountUsd, enabled, sortOrder, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        String(name).trim(),
        parsedAmount,
        enabled === false ? 0 : 1,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        now,
        now,
      ],
    });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("[pricing-studio POST fixed-costs]", err);
    res.status(500).json({ error: String(err) });
  }
});

pricingStudioRouter.put("/fixed-costs/:id", requireOwner, async (req, res) => {
  try {
    await readyTable();
    const { name, amountUsd, enabled, sortOrder } = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const args: Array<string | number> = [];

    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) {
        res.status(400).json({ error: "name cannot be empty" });
        return;
      }
      sets.push("name = ?");
      args.push(n);
    }

    if (amountUsd !== undefined) {
      const amount = Number(amountUsd);
      if (!Number.isFinite(amount) || amount < 0) {
        res.status(400).json({ error: "amountUsd must be a non-negative number" });
        return;
      }
      sets.push("amountUsd = ?");
      args.push(amount);
    }

    if (enabled !== undefined) {
      sets.push("enabled = ?");
      args.push(enabled ? 1 : 0);
    }

    if (sortOrder !== undefined) {
      const s = Number(sortOrder);
      if (!Number.isFinite(s)) {
        res.status(400).json({ error: "sortOrder must be a number" });
        return;
      }
      sets.push("sortOrder = ?");
      args.push(Math.floor(s));
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    sets.push("updatedAt = ?");
    args.push(new Date().toISOString());
    args.push(String(req.params.id));

    await getDb().execute({
      sql: `UPDATE AdminMonthlyFixedCost SET ${sets.join(", ")} WHERE id = ?`,
      args,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[pricing-studio PUT fixed-costs]", err);
    res.status(500).json({ error: String(err) });
  }
});

pricingStudioRouter.delete("/fixed-costs/:id", requireOwner, async (req, res) => {
  try {
    await readyTable();
    await getDb().execute({
      sql: "DELETE FROM AdminMonthlyFixedCost WHERE id = ?",
      args: [String(req.params.id)],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[pricing-studio DELETE fixed-costs]", err);
    res.status(500).json({ error: String(err) });
  }
});
