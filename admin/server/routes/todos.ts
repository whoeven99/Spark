import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../lib/db.js";

export const todosRouter = Router();

async function ensureTable() {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS AdminTodo (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
}

ensureTable().catch((e) => console.error("[todos] init table error", e));

todosRouter.get("/", async (_req, res) => {
  try {
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
    const { title, description, assignee, priority, createdBy } = req.body;
    if (!title || !createdBy) {
      res.status(400).json({ error: "title and createdBy required" });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    await getDb().execute({
      sql: `INSERT INTO AdminTodo (id, title, description, assignee, status, priority, createdBy, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)`,
      args: [id, title, description ?? null, assignee ?? null, priority ?? "medium", createdBy, now, now],
    });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.put("/:id", async (req, res) => {
  try {
    const { title, description, assignee, status, priority } = req.body;
    const now = new Date().toISOString();
    await getDb().execute({
      sql: `UPDATE AdminTodo SET title=?, description=?, assignee=?, status=?, priority=?, updatedAt=? WHERE id=?`,
      args: [title, description ?? null, assignee ?? null, status, priority, now, req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.delete("/:id", async (req, res) => {
  try {
    await getDb().execute({
      sql: "DELETE FROM AdminTodo WHERE id=?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
