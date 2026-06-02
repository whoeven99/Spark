import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../lib/db.js";

export const todosRouter = Router();

async function ensureTable() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminTodo (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      etaDays INTEGER,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Lightweight migration for existing tables created before etaDays was introduced.
  const tableInfo = await db.execute("PRAGMA table_info(AdminTodo)");
  const hasEtaDays = tableInfo.rows.some((row) => String(row.name) === "etaDays");
  if (!hasEtaDays) {
    await db.execute("ALTER TABLE AdminTodo ADD COLUMN etaDays INTEGER");
  }
}

let tableReady: Promise<void> | null = null;

function readyTable() {
  if (!tableReady) {
    tableReady = ensureTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

todosRouter.get("/", async (_req, res) => {
  try {
    await readyTable();
    const result = await getDb().execute(
      "SELECT * FROM AdminTodo ORDER BY createdAt DESC",
    );
    res.json({ todos: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.post("/", async (req, res) => {
  try {
    await readyTable();
    const { title, description, assignee, priority, createdBy, etaDays } = req.body;
    if (!title || !createdBy) {
      res.status(400).json({ error: "title and createdBy required" });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const parsedEtaDays =
      etaDays == null || etaDays === ""
        ? null
        : Math.max(0, Math.floor(Number(etaDays)));
    await getDb().execute({
      sql: `INSERT INTO AdminTodo (id, title, description, assignee, status, priority, etaDays, createdBy, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`,
      args: [id, title, description ?? null, assignee ?? null, priority ?? "medium", parsedEtaDays, createdBy, now, now],
    });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.put("/:id", async (req, res) => {
  try {
    await readyTable();
    const { title, description, assignee, status, priority, etaDays } = req.body;
    const now = new Date().toISOString();
    const parsedEtaDays =
      etaDays == null || etaDays === ""
        ? null
        : Math.max(0, Math.floor(Number(etaDays)));
    await getDb().execute({
      sql: `UPDATE AdminTodo SET title=?, description=?, assignee=?, status=?, priority=?, etaDays=?, updatedAt=? WHERE id=?`,
      args: [title, description ?? null, assignee ?? null, status, priority, parsedEtaDays, now, req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.delete("/:id", async (req, res) => {
  try {
    await readyTable();
    await getDb().execute({
      sql: "DELETE FROM AdminTodo WHERE id=?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
