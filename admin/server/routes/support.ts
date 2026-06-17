import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../lib/db.js";

export const supportRouter = Router();

/**
 * Prisma(@prisma/adapter-libsql) 把 DateTime 存成 RFC3339 文本，形如
 * "2026-06-12T18:03:31.343+00:00"。admin 走原生 SQL 写入同一列时必须用相同格式，
 * 否则与 Prisma 写入的消息按 createdAt 字典序排序会错乱。
 */
function nowIso(): string {
  return new Date().toISOString().replace("Z", "+00:00");
}

const PREVIEW_LEN = 120;
const MAX_REPLY_LEN = 4000;

/** 会话列表：可按 status / 关键字（shop / 邮箱）过滤，未读多的优先。 */
supportRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const status = (req.query.status as string | undefined)?.trim();
    const search = (req.query.search as string | undefined)?.trim();

    const where: string[] = [];
    const args: string[] = [];
    if (status && status !== "all") {
      where.push("status = ?");
      args.push(status);
    }
    if (search) {
      where.push("(shop LIKE ? OR contactEmail LIKE ? OR shopEmail LIKE ?)");
      const like = `%${search}%`;
      args.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await db.execute({
      sql: `SELECT id, shop, contactEmail, shopEmail, status, lastMessage,
                   lastMessageAt, unreadForOps, unreadForShop, createdAt, updatedAt
            FROM SupportConversation
            ${whereSql}
            ORDER BY unreadForOps > 0 DESC, lastMessageAt DESC
            LIMIT 200`,
      args,
    });

    res.json({ conversations: result.rows });
  } catch (err) {
    console.error("[support/list]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 取单个会话 + 全部消息，并将其标记为运营已读（unreadForOps=0）。 */
supportRouter.get("/:shop", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;

    const convResult = await db.execute({
      sql: `SELECT id, shop, contactEmail, shopEmail, status, lastMessage,
                   lastMessageAt, unreadForOps, unreadForShop, createdAt, updatedAt
            FROM SupportConversation WHERE shop = ? LIMIT 1`,
      args: [shop],
    });
    const conversation = convResult.rows[0];
    if (!conversation) {
      res.status(404).json({ error: "conversation not found" });
      return;
    }

    const messagesResult = await db.execute({
      sql: `SELECT id, sender, senderName, content, createdAt
            FROM SupportMessage WHERE conversationId = ? ORDER BY createdAt ASC`,
      args: [conversation.id],
    });

    if (Number(conversation.unreadForOps ?? 0) > 0) {
      await db.execute({
        sql: "UPDATE SupportConversation SET unreadForOps = 0, updatedAt = ? WHERE shop = ?",
        args: [nowIso(), shop],
      });
      conversation.unreadForOps = 0;
    }

    res.json({ conversation, messages: messagesResult.rows });
  } catch (err) {
    console.error("[support/get]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 运营回复：追加 ops 消息，累计商家未读，刷新预览。 */
supportRouter.post("/:shop/reply", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;
    const content = String(req.body?.content ?? "").trim().slice(0, MAX_REPLY_LEN);
    const senderName = req.body?.senderName
      ? String(req.body.senderName).slice(0, 60)
      : null;
    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }

    const convResult = await db.execute({
      sql: "SELECT id FROM SupportConversation WHERE shop = ? LIMIT 1",
      args: [shop],
    });
    const conversation = convResult.rows[0];
    if (!conversation) {
      res.status(404).json({ error: "conversation not found" });
      return;
    }

    const now = nowIso();
    const messageId = randomUUID();
    await db.execute({
      sql: `INSERT INTO SupportMessage (id, conversationId, sender, senderName, content, createdAt)
            VALUES (?, ?, 'ops', ?, ?, ?)`,
      args: [messageId, conversation.id, senderName, content, now],
    });
    await db.execute({
      sql: `UPDATE SupportConversation
            SET lastMessage = ?, lastMessageAt = ?, unreadForShop = unreadForShop + 1,
                unreadForOps = 0, status = 'open', updatedAt = ?
            WHERE shop = ?`,
      args: [content.slice(0, PREVIEW_LEN), now, now, shop],
    });

    res.json({ ok: true, id: messageId, createdAt: now });
  } catch (err) {
    console.error("[support/reply]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 关闭 / 重开会话。 */
supportRouter.post("/:shop/status", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;
    const status = String(req.body?.status ?? "");
    if (status !== "open" && status !== "closed") {
      res.status(400).json({ error: "status must be open|closed" });
      return;
    }
    await db.execute({
      sql: "UPDATE SupportConversation SET status = ?, updatedAt = ? WHERE shop = ?",
      args: [status, nowIso(), shop],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[support/status]", err);
    res.status(500).json({ error: String(err) });
  }
});
