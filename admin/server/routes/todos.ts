import { Router } from "express";
import { randomUUID } from "crypto";
import { getAdminOpsDb } from "../lib/adminOpsDb.js";

export const todosRouter = Router();

const VALID_ASSIGNEES = new Set(["yewen", "allen", "zhuangze"]);

function parseFollowers(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v).trim())
      .filter((v) => VALID_ASSIGNEES.has(v));
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseFollowers(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function serializeFollowers(raw: unknown): string {
  return JSON.stringify(parseFollowers(raw));
}

function mapTodoRow(row: Record<string, unknown>) {
  return {
    ...row,
    followers: parseFollowers(row.followers),
  };
}

async function ensureTable() {
  const db = getAdminOpsDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminTodo (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      etaDays INTEGER,
      followers TEXT NOT NULL DEFAULT '[]',
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Lightweight migrations for existing tables.
  const tableInfo = await db.execute("PRAGMA table_info(AdminTodo)");
  const colNames = new Set(tableInfo.rows.map((row) => String(row.name)));
  if (!colNames.has("etaDays")) {
    await db.execute("ALTER TABLE AdminTodo ADD COLUMN etaDays INTEGER");
  }
  if (!colNames.has("followers")) {
    await db.execute(
      "ALTER TABLE AdminTodo ADD COLUMN followers TEXT NOT NULL DEFAULT '[]'",
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminTodoComment (
      id TEXT PRIMARY KEY,
      todoId TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_todo_comment_todo
    ON AdminTodoComment (todoId, createdAt)
  `);
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
    const result = await getAdminOpsDb().execute(
      "SELECT * FROM AdminTodo ORDER BY createdAt DESC",
    );
    res.json({
      todos: result.rows.map((row) =>
        mapTodoRow(row as Record<string, unknown>),
      ),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.post("/", async (req, res) => {
  try {
    await readyTable();
    const { title, description, assignee, priority, createdBy, etaDays, followers } =
      req.body;
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
    await getAdminOpsDb().execute({
      sql: `INSERT INTO AdminTodo (id, title, description, assignee, status, priority, etaDays, followers, createdBy, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        title,
        description ?? null,
        assignee ?? null,
        priority ?? "medium",
        parsedEtaDays,
        serializeFollowers(followers),
        createdBy,
        now,
        now,
      ],
    });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.put("/:id", async (req, res) => {
  try {
    await readyTable();
    const { title, description, assignee, status, priority, etaDays, followers } =
      req.body;
    const now = new Date().toISOString();
    const parsedEtaDays =
      etaDays == null || etaDays === ""
        ? null
        : Math.max(0, Math.floor(Number(etaDays)));
    await getAdminOpsDb().execute({
      sql: `UPDATE AdminTodo SET title=?, description=?, assignee=?, status=?, priority=?, etaDays=?, followers=?, updatedAt=? WHERE id=?`,
      args: [
        title,
        description ?? null,
        assignee ?? null,
        status,
        priority,
        parsedEtaDays,
        serializeFollowers(followers),
        now,
        req.params.id,
      ],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.delete("/:id", async (req, res) => {
  try {
    await readyTable();
    const db = getAdminOpsDb();
    await db.execute({
      sql: "DELETE FROM AdminTodoComment WHERE todoId=?",
      args: [req.params.id],
    });
    await db.execute({
      sql: "DELETE FROM AdminTodo WHERE id=?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.get("/:id/comments", async (req, res) => {
  try {
    await readyTable();
    const result = await getAdminOpsDb().execute({
      sql: `SELECT id, todoId, author, body, createdAt
            FROM AdminTodoComment
            WHERE todoId=?
            ORDER BY createdAt ASC`,
      args: [req.params.id],
    });
    res.json({ comments: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

todosRouter.post("/:id/comments", async (req, res) => {
  try {
    await readyTable();
    const { author, body } = req.body as { author?: string; body?: string };
    const trimmed = typeof body === "string" ? body.trim() : "";
    if (!author || !VALID_ASSIGNEES.has(author) || !trimmed) {
      res.status(400).json({ error: "author and body required" });
      return;
    }

    const todo = await getAdminOpsDb().execute({
      sql: "SELECT id FROM AdminTodo WHERE id=?",
      args: [req.params.id],
    });
    if (todo.rows.length === 0) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await getAdminOpsDb().execute({
      sql: `INSERT INTO AdminTodoComment (id, todoId, author, body, createdAt)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, req.params.id, author, trimmed, now],
    });
    await getAdminOpsDb().execute({
      sql: "UPDATE AdminTodo SET updatedAt=? WHERE id=?",
      args: [now, req.params.id],
    });
    res.json({
      ok: true,
      comment: {
        id,
        todoId: req.params.id,
        author,
        body: trimmed,
        createdAt: now,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
