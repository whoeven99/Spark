import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getDb, isSparkDbConfigured } from "../lib/db.js";
import { parseMyshopifyShopDomain } from "../lib/shopHash.js";

export const devStoreAllowlistRouter = Router();

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

type AllowlistRow = {
  id: string;
  shop: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

function mapRow(raw: Record<string, unknown>): AllowlistRow {
  return {
    id: String(raw.id ?? ""),
    shop: String(raw.shop ?? ""),
    note: stringOrNull(raw.note),
    createdBy: stringOrNull(raw.createdBy),
    createdAt: isoOrNull(raw.createdAt) ?? "",
  };
}

devStoreAllowlistRouter.get("/", async (_req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  try {
    const db = getDb();
    const result = await db.execute({
      sql: `
        SELECT id, shop, note, createdBy, createdAt
        FROM DevStoreSubscribeAllowlist
        ORDER BY createdAt DESC
      `,
      args: [],
    });
    res.json({
      items: result.rows.map((row) => mapRow(row as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("[dev-store-allowlist]", error);
    res.status(500).json({ error: String(error) });
  }
});

devStoreAllowlistRouter.post("/", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const shop = parseMyshopifyShopDomain(
    typeof req.body?.shop === "string" ? req.body.shop : "",
  );
  if (!shop) {
    res.status(400).json({ error: "店铺须为 *.myshopify.com" });
    return;
  }

  const note =
    typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
  const createdBy =
    typeof res.locals.adminUserLabel === "string"
      ? res.locals.adminUserLabel
      : null;

  try {
    const db = getDb();
    const id = randomUUID();
    await db.execute({
      sql: `
        INSERT INTO DevStoreSubscribeAllowlist
          (id, shop, note, createdBy, createdAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      args: [id, shop, note || null, createdBy],
    });
    const created = await db.execute({
      sql: `
        SELECT id, shop, note, createdBy, createdAt
        FROM DevStoreSubscribeAllowlist WHERE id = ?
      `,
      args: [id],
    });
    const row = created.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(500).json({ error: "创建成功但读取失败" });
      return;
    }
    res.json(mapRow(row));
  } catch (error) {
    const message = String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      res.status(409).json({ error: "该店铺已在白名单" });
      return;
    }
    console.error("[dev-store-allowlist] create", error);
    res.status(500).json({ error: message });
  }
});

devStoreAllowlistRouter.delete("/:id", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const id = String(req.params.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "缺少 id" });
    return;
  }

  try {
    const db = getDb();
    const current = await db.execute({
      sql: `SELECT id FROM DevStoreSubscribeAllowlist WHERE id = ?`,
      args: [id],
    });
    if (!current.rows[0]) {
      res.status(404).json({ error: "白名单记录不存在" });
      return;
    }
    await db.execute({
      sql: `DELETE FROM DevStoreSubscribeAllowlist WHERE id = ?`,
      args: [id],
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[dev-store-allowlist] delete", error);
    res.status(500).json({ error: String(error) });
  }
});
