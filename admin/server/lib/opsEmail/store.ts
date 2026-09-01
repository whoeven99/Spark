import { randomUUID } from "node:crypto";
import { getAdminOpsDb, isAdminOpsDbConfigured } from "../adminOpsDb.js";
import type { OpsEmailSendStatus } from "./types.js";

export type OpsEmailSendLogRow = {
  id: string;
  shop: string;
  emailMasked: string | null;
  templateKey: string;
  templateId: number;
  subject: string;
  status: OpsEmailSendStatus;
  error: string | null;
  requestId: string | null;
  createdBy: string;
  createdAt: string;
};

let ensured = false;

export async function ensureOpsEmailTables(): Promise<void> {
  if (ensured) return;
  const db = getAdminOpsDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS AdminEmailSendLog (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      emailMasked TEXT,
      templateKey TEXT NOT NULL,
      templateId INTEGER NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      error TEXT,
      requestId TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS AdminEmailSendLog_shop_idx ON AdminEmailSendLog(shop)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS AdminEmailSendLog_createdAt_idx ON AdminEmailSendLog(createdAt)`,
  );
  ensured = true;
}

export async function insertSendLog(
  row: Omit<OpsEmailSendLogRow, "id" | "createdAt">,
): Promise<void> {
  if (!isAdminOpsDbConfigured()) return;
  await ensureOpsEmailTables();
  const db = getAdminOpsDb();
  await db.execute({
    sql: `INSERT INTO AdminEmailSendLog (
      id, shop, emailMasked, templateKey, templateId, subject,
      status, error, requestId, createdBy, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      row.shop,
      row.emailMasked,
      row.templateKey,
      row.templateId,
      row.subject,
      row.status,
      row.error,
      row.requestId,
      row.createdBy,
      new Date().toISOString(),
    ],
  });
}

export async function listRecentSendLogs(limit = 80): Promise<OpsEmailSendLogRow[]> {
  if (!isAdminOpsDbConfigured()) return [];
  await ensureOpsEmailTables();
  const db = getAdminOpsDb();
  const result = await db.execute({
    sql: `SELECT * FROM AdminEmailSendLog ORDER BY createdAt DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(mapLogRow);
}

export async function latestSendByShop(): Promise<
  Map<string, { lastSentAt: string; lastSentStatus: string }>
> {
  const map = new Map<string, { lastSentAt: string; lastSentStatus: string }>();
  if (!isAdminOpsDbConfigured()) return map;
  await ensureOpsEmailTables();
  const db = getAdminOpsDb();
  const result = await db.execute(
    `SELECT shop, status, createdAt FROM AdminEmailSendLog ORDER BY createdAt DESC`,
  );
  for (const row of result.rows) {
    const shop = String(row.shop ?? "");
    if (!shop || map.has(shop)) continue;
    map.set(shop, {
      lastSentAt: String(row.createdAt ?? ""),
      lastSentStatus: String(row.status ?? ""),
    });
  }
  return map;
}

function mapLogRow(row: Record<string, unknown>): OpsEmailSendLogRow {
  return {
    id: String(row.id),
    shop: String(row.shop),
    emailMasked: row.emailMasked != null ? String(row.emailMasked) : null,
    templateKey: String(row.templateKey),
    templateId: Number(row.templateId),
    subject: String(row.subject ?? ""),
    status: String(row.status) as OpsEmailSendStatus,
    error: row.error != null ? String(row.error) : null,
    requestId: row.requestId != null ? String(row.requestId) : null,
    createdBy: String(row.createdBy),
    createdAt: String(row.createdAt),
  };
}
