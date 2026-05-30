import { Router } from "express";
import { getDb } from "../lib/db.js";
import { requireOwner } from "../middleware/auth.js";

export const pricingWorkbenchV2Router = Router();

const V2_DEFAULTS = {
  payingShops: 100,
  targetGrossMarginPct: 70,
  planPriceUsd: 29.99,
  tokenGrantPerUser: 500_000,
  shopifyRevSharePct: 15,
  paymentFeePct: 0,
};

const V2_NUMERIC_KEYS = [
  "v2_payingShops",
  "v2_targetGrossMarginPct",
  "v2_planPriceUsd",
  "v2_tokenGrantPerUser",
  "v2_shopifyRevSharePct",
  "v2_paymentFeePct",
] as const;

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

async function readV2Settings() {
  const keys = [...V2_NUMERIC_KEYS, "v2_usageScenariosJson"];
  const rows = await getDb().execute({
    sql: `SELECT key, value FROM AdminPricingConfig WHERE key IN (${keys.map(() => "?").join(",")})`,
    args: keys,
  });

  const map = new Map<string, string>();
  for (const row of rows.rows) {
    map.set(String(row.key), String(row.value));
  }

  let usageScenarios: unknown[] | null = null;
  const scenariosRaw = map.get("v2_usageScenariosJson");
  if (scenariosRaw) {
    try {
      const parsed = JSON.parse(scenariosRaw);
      if (Array.isArray(parsed)) usageScenarios = parsed;
    } catch {
      usageScenarios = null;
    }
  }

  return {
    payingShops: Number(map.get("v2_payingShops") ?? V2_DEFAULTS.payingShops),
    targetGrossMarginPct: Number(
      map.get("v2_targetGrossMarginPct") ?? V2_DEFAULTS.targetGrossMarginPct,
    ),
    planPriceUsd: Number(map.get("v2_planPriceUsd") ?? V2_DEFAULTS.planPriceUsd),
    tokenGrantPerUser: Number(
      map.get("v2_tokenGrantPerUser") ?? V2_DEFAULTS.tokenGrantPerUser,
    ),
    shopifyRevSharePct: Number(
      map.get("v2_shopifyRevSharePct") ?? V2_DEFAULTS.shopifyRevSharePct,
    ),
    paymentFeePct: Number(map.get("v2_paymentFeePct") ?? V2_DEFAULTS.paymentFeePct),
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

async function readSharedFixedCosts() {
  await readyTable();
  const result = await getDb().execute(`
    SELECT id, name, amountUsd, enabled, sortOrder, createdAt, updatedAt
    FROM AdminMonthlyFixedCost
    ORDER BY sortOrder ASC, createdAt ASC
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    amountUsd: Number(row.amountUsd ?? 0),
    enabled: Number(row.enabled) !== 0,
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }));
}

pricingWorkbenchV2Router.get("/", async (_req, res) => {
  try {
    await readyTable();
    const [settings, fixedCosts, plans] = await Promise.all([
      readV2Settings(),
      readSharedFixedCosts(),
      readPlanCatalog().catch(() => []),
    ]);
    res.json({ settings, fixedCosts, plans });
  } catch (err) {
    console.error("[pricing-workbench GET]", err);
    res.status(500).json({ error: String(err) });
  }
});

pricingWorkbenchV2Router.put("/settings", requireOwner, async (req, res) => {
  try {
    await readyTable();
    const now = new Date().toISOString();
    const {
      payingShops,
      targetGrossMarginPct,
      planPriceUsd,
      tokenGrantPerUser,
      shopifyRevSharePct,
      paymentFeePct,
      usageScenarios,
    } = req.body as Record<string, unknown>;

    const entries: Array<[string, number]> = [
      ["v2_payingShops", Number(payingShops)],
      ["v2_targetGrossMarginPct", Number(targetGrossMarginPct)],
      ["v2_planPriceUsd", Number(planPriceUsd)],
      ["v2_tokenGrantPerUser", Number(tokenGrantPerUser)],
      ["v2_shopifyRevSharePct", Number(shopifyRevSharePct ?? V2_DEFAULTS.shopifyRevSharePct)],
      ["v2_paymentFeePct", Number(paymentFeePct ?? V2_DEFAULTS.paymentFeePct)],
    ];

    for (const [key, value] of entries) {
      if (!Number.isFinite(value) || value < 0) {
        res.status(400).json({ error: `Invalid value for ${key}` });
        return;
      }
    }

    const revShare = Number(shopifyRevSharePct ?? V2_DEFAULTS.shopifyRevSharePct);
    const payFee = Number(paymentFeePct ?? V2_DEFAULTS.paymentFeePct);
    if (revShare + payFee >= 100) {
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
        args: ["v2_usageScenariosJson", JSON.stringify(usageScenarios), now],
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[pricing-workbench PUT settings]", err);
    res.status(500).json({ error: String(err) });
  }
});
