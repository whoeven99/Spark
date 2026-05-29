import { Router } from "express";
import { getDb } from "../lib/db.js";
import { requireOwner } from "../middleware/auth.js";

export const billingRulesRouter = Router();

billingRulesRouter.get("/", async (_req, res) => {
  try {
    const db = getDb();
    const result = await db.execute(
      "SELECT ruleKey, appName, feature, modelKey, displayName, multiplier, baseTokenCost, enabled, createdAt, updatedAt FROM TokenBillingRule ORDER BY feature, modelKey",
    );
    const rules = result.rows.map((r) => ({
      ruleKey: r.ruleKey as string,
      appName: r.appName as string,
      feature: r.feature as string,
      modelKey: r.modelKey as string,
      displayName: r.displayName as string,
      multiplier: Number(r.multiplier),
      baseTokenCost: r.baseTokenCost != null ? Number(r.baseTokenCost) : null,
      enabled: Number(r.enabled) !== 0,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    }));
    res.json({ rules });
  } catch (err) {
    console.error("[billing-rules GET]", err);
    res.status(500).json({ error: String(err) });
  }
});

billingRulesRouter.post("/", requireOwner, async (req, res) => {
  try {
    const db = getDb();
    const { appName, feature, modelKey, displayName, multiplier, baseTokenCost, enabled } = req.body as Record<string, unknown>;
    if (!appName || !feature || !modelKey || !displayName || multiplier == null) {
      res.status(400).json({ error: "Missing required fields: appName, feature, modelKey, displayName, multiplier" });
      return;
    }
    const ruleKey = `${appName}:${feature}:${modelKey}`;
    const now = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO TokenBillingRule (ruleKey, appName, feature, modelKey, displayName, multiplier, baseTokenCost, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [ruleKey, String(appName), String(feature), String(modelKey), String(displayName), Number(multiplier), baseTokenCost != null ? Number(baseTokenCost) : null, enabled !== false ? 1 : 0, now, now],
    });
    res.json({ ok: true, ruleKey });
  } catch (err) {
    console.error("[billing-rules POST]", err);
    if (String(err).includes("UNIQUE") || String(err).includes("unique")) {
      res.status(409).json({ error: "该 appName/feature/modelKey 组合已存在" });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

billingRulesRouter.put("/:ruleKey", requireOwner, async (req, res) => {
  try {
    const db = getDb();
    const ruleKey = String(req.params.ruleKey);
    const { displayName, multiplier, baseTokenCost, enabled } = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (displayName !== undefined) { sets.push("displayName = ?"); args.push(String(displayName)); }
    if (multiplier !== undefined) { sets.push("multiplier = ?"); args.push(Number(multiplier)); }
    if (baseTokenCost !== undefined) { sets.push("baseTokenCost = ?"); args.push(baseTokenCost != null ? Number(baseTokenCost) : null); }
    if (enabled !== undefined) { sets.push("enabled = ?"); args.push(enabled ? 1 : 0); }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    sets.push("updatedAt = ?");
    args.push(new Date().toISOString());
    args.push(ruleKey);

    await db.execute({ sql: `UPDATE TokenBillingRule SET ${sets.join(", ")} WHERE ruleKey = ?`, args });
    res.json({ ok: true });
  } catch (err) {
    console.error("[billing-rules PUT]", err);
    res.status(500).json({ error: String(err) });
  }
});

billingRulesRouter.delete("/:ruleKey", requireOwner, async (req, res) => {
  try {
    const db = getDb();
    const ruleKey = String(req.params.ruleKey);
    await db.execute({ sql: "DELETE FROM TokenBillingRule WHERE ruleKey = ?", args: [ruleKey] });
    res.json({ ok: true });
  } catch (err) {
    console.error("[billing-rules DELETE]", err);
    res.status(500).json({ error: String(err) });
  }
});
