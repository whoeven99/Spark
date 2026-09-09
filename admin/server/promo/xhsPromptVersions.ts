import { randomUUID } from "node:crypto";
import { getAdminOpsDb, isAdminOpsDbConfigured } from "../lib/adminOpsDb.js";
import { isXhsDirection, type XhsDirection } from "./xhsPlaybooks.js";

export const PROMPT_SLOTS = ["title", "copy", "cover", "cards"] as const;
export type PromptSlot = (typeof PROMPT_SLOTS)[number];

const SLOT_FIELDS: Record<PromptSlot, readonly string[]> = {
  title: ["titleSystem", "titleUser"],
  copy: ["copySystem", "copyUser"],
  cover: ["imagePrompt"],
  cards: ["cardSystem", "cardUser"],
};

export type PromptVersion = {
  id: string;
  slot: PromptSlot;
  direction: XhsDirection;
  note: string | null;
  payload: Record<string, string>;
  createdBy: string;
  createdAt: string;
};

export function isPromptSlot(value: string): value is PromptSlot {
  return (PROMPT_SLOTS as readonly string[]).includes(value);
}

function clipField(text: string): string {
  return text.slice(0, 12000);
}

export function normalizePayload(slot: PromptSlot, raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of SLOT_FIELDS[slot]) {
    out[key] = clipField(String(obj[key] ?? "").trim());
  }
  if (Object.values(out).every((value) => !value)) return null;
  return out;
}

export function payloadKey(payload: Record<string, string>): string {
  return JSON.stringify(payload);
}

function mapRow(row: Record<string, unknown>): PromptVersion | null {
  const slot = String(row.slot ?? "");
  const direction = String(row.direction ?? "");
  if (!isPromptSlot(slot) || !isXhsDirection(direction)) return null;
  let payload: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(row.payload ?? "{}")) as unknown;
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, string>;
    }
  } catch {
    return null;
  }
  return {
    id: String(row.id ?? ""),
    slot,
    direction,
    note: row.note == null || row.note === "" ? null : String(row.note),
    payload,
    createdBy: String(row.createdBy ?? ""),
    createdAt: String(row.createdAt ?? ""),
  };
}

export async function ensurePromptVersionTable(): Promise<void> {
  if (!isAdminOpsDbConfigured()) {
    throw new Error("未配置 ADMIN_DATABASE_URL / ADMIN_DATABASE_AUTH_TOKEN");
  }
  const db = getAdminOpsDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS XhsPromoPromptVersion (
      id TEXT PRIMARY KEY,
      slot TEXT NOT NULL,
      direction TEXT NOT NULL,
      note TEXT,
      payload TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS XhsPromoPromptVersion_slot_direction_createdAt
    ON XhsPromoPromptVersion (slot, direction, createdAt)
  `);
}

export async function listPromptVersions(
  slot: PromptSlot,
  direction: XhsDirection,
): Promise<PromptVersion[]> {
  await ensurePromptVersionTable();
  const result = await getAdminOpsDb().execute({
    sql: `SELECT id, slot, direction, note, payload, createdBy, createdAt
          FROM XhsPromoPromptVersion
          WHERE slot = ? AND direction = ?
          ORDER BY createdAt DESC`,
    args: [slot, direction],
  });
  return result.rows
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((item): item is PromptVersion => item != null);
}

export async function latestPromptVersions(
  direction: XhsDirection,
): Promise<Record<PromptSlot, PromptVersion | null>> {
  await ensurePromptVersionTable();
  const latest: Record<PromptSlot, PromptVersion | null> = {
    title: null,
    copy: null,
    cover: null,
    cards: null,
  };
  await Promise.all(
    PROMPT_SLOTS.map(async (slot) => {
      const result = await getAdminOpsDb().execute({
        sql: `SELECT id, slot, direction, note, payload, createdBy, createdAt
              FROM XhsPromoPromptVersion
              WHERE slot = ? AND direction = ?
              ORDER BY createdAt DESC
              LIMIT 1`,
        args: [slot, direction],
      });
      const row = result.rows[0];
      latest[slot] = row ? mapRow(row as Record<string, unknown>) : null;
    }),
  );
  return latest;
}

export async function savePromptVersion(params: {
  slot: PromptSlot;
  direction: XhsDirection;
  note: string | null;
  payload: Record<string, string>;
  createdBy: string;
}): Promise<{ version: PromptVersion; duplicate: boolean }> {
  await ensurePromptVersionTable();
  const current = (await latestPromptVersions(params.direction))[params.slot];
  if (current && payloadKey(current.payload) === payloadKey(params.payload)) {
    return { version: current, duplicate: true };
  }
  const version: PromptVersion = {
    id: randomUUID(),
    slot: params.slot,
    direction: params.direction,
    note: params.note,
    payload: params.payload,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
  await getAdminOpsDb().execute({
    sql: `INSERT INTO XhsPromoPromptVersion (id, slot, direction, note, payload, createdBy, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      version.id,
      version.slot,
      version.direction,
      version.note,
      JSON.stringify(version.payload),
      version.createdBy,
      version.createdAt,
    ],
  });
  return { version, duplicate: false };
}

export async function deletePromptVersion(id: string): Promise<boolean> {
  await ensurePromptVersionTable();
  const result = await getAdminOpsDb().execute({
    sql: "DELETE FROM XhsPromoPromptVersion WHERE id = ?",
    args: [id],
  });
  return Number(result.rowsAffected ?? 0) > 0;
}
