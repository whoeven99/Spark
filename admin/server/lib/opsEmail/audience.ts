import { getDb, isSparkDbConfigured } from "../db.js";
import { getTsfDb, isTsfDbConfigured } from "../tsfDb.js";
import { maskEmail, shopHandle } from "./maskEmail.js";
import { latestSendByShop } from "./store.js";
import type { OpsEmailAudienceRow } from "./types.js";

type SessionProfile = {
  email: string | null;
  recipientName: string | null;
  locale: string | null;
};

type AccountRow = {
  shop: string;
  deletedAt: string | null;
  planKey: string | null;
  subStatus: string | null;
};

export type AudienceFilters = {
  search?: string;
  installedOnly?: boolean;
  hasEmailOnly?: boolean;
  excludeSpark?: boolean;
  planKey?: string;
};

let sessionColumns: Set<string> | null = null;

async function loadSessionColumns(): Promise<Set<string>> {
  if (sessionColumns) return sessionColumns;
  try {
    const db = getTsfDb();
    const info = await db.execute("PRAGMA table_info(Session)");
    sessionColumns = new Set(info.rows.map((row) => String(row.name ?? "")));
  } catch {
    sessionColumns = new Set(["shop", "email", "firstName", "lastName", "locale"]);
  }
  return sessionColumns;
}

async function loadTsfAccounts(): Promise<AccountRow[]> {
  const db = getTsfDb();
  const result = await db.execute(`
    SELECT
      a.shop,
      a.deletedAt,
      sub.planKey,
      sub.status AS subStatus
    FROM Account a
    LEFT JOIN AppSubscription sub ON a.shop = sub.shop
    ORDER BY a.createdAt DESC
    LIMIT 2000
  `);
  return result.rows.map((row) => ({
    shop: String(row.shop ?? ""),
    deletedAt: row.deletedAt != null ? String(row.deletedAt) : null,
    planKey: row.planKey != null ? String(row.planKey) : null,
    subStatus: row.subStatus != null ? String(row.subStatus) : null,
  }));
}

async function loadSessionProfiles(): Promise<Map<string, SessionProfile>> {
  const columns = await loadSessionColumns();
  const map = new Map<string, SessionProfile>();
  if (!columns.has("shop")) return map;

  const select = ["shop"];
  if (columns.has("email")) select.push("email");
  if (columns.has("firstName")) select.push("firstName");
  if (columns.has("lastName")) select.push("lastName");
  if (columns.has("locale")) select.push("locale");

  const db = getTsfDb();
  const result = await db.execute(
    `SELECT ${select.join(", ")} FROM Session WHERE shop IS NOT NULL`,
  );

  for (const row of result.rows) {
    const shop = String(row.shop ?? "").trim().toLowerCase();
    if (!shop) continue;
    const email = columns.has("email") ? String(row.email ?? "").trim() : "";
    const firstName = columns.has("firstName")
      ? String(row.firstName ?? "").trim()
      : "";
    const lastName = columns.has("lastName")
      ? String(row.lastName ?? "").trim()
      : "";
    const locale = columns.has("locale") ? String(row.locale ?? "").trim() : "";
    const current = map.get(shop);
    if (current?.email && !email) continue;
    map.set(shop, {
      email: email || current?.email || null,
      recipientName:
        [firstName, lastName].filter(Boolean).join(" ") ||
        current?.recipientName ||
        null,
      locale: locale || current?.locale || null,
    });
  }
  return map;
}

async function loadSparkShops(): Promise<Set<string>> {
  if (!isSparkDbConfigured()) return new Set();
  const db = getDb();
  const result = await db.execute("SELECT DISTINCT shop FROM Account");
  return new Set(
    result.rows
      .map((row) => String(row.shop ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
}

export function buildShopParams(row: OpsEmailAudienceRow): Record<string, string> {
  const handle = shopHandle(row.shop);
  return {
    shop: row.shop,
    shopDomain: row.shop,
    shopName: handle,
    shop_id: handle,
    recipientName: row.recipientName || "商家",
    email: row.email || "",
  };
}

export async function listOpsEmailAudience(
  filters: AudienceFilters = {},
): Promise<{
  shops: OpsEmailAudienceRow[];
  summary: {
    total: number;
    withEmail: number;
    missingEmail: number;
    sparkInstalled: number;
  };
}> {
  if (!isTsfDbConfigured()) {
    throw new Error("TSF Turso 未配置");
  }

  const [accounts, sessions, sparkShops, lastSends] = await Promise.all([
    loadTsfAccounts(),
    loadSessionProfiles(),
    loadSparkShops(),
    latestSendByShop(),
  ]);

  const search = filters.search?.trim().toLowerCase() ?? "";
  const rows: OpsEmailAudienceRow[] = [];

  for (const account of accounts) {
    const shop = account.shop.trim().toLowerCase();
    if (!shop) continue;
    const session = sessions.get(shop);
    const installed = account.deletedAt == null;
    const sparkInstalled = sparkShops.has(shop);
    const last = lastSends.get(shop);
    const row: OpsEmailAudienceRow = {
      shop,
      email: session?.email ?? null,
      emailMasked: maskEmail(session?.email),
      recipientName: session?.recipientName ?? null,
      locale: session?.locale ?? null,
      planKey: account.planKey,
      subStatus: account.subStatus,
      installed,
      sparkInstalled,
      lastSentAt: last?.lastSentAt ?? null,
      lastSentStatus: last?.lastSentStatus ?? null,
    };

    if (search && !shop.includes(search)) continue;
    if (filters.installedOnly && !installed) continue;
    if (filters.hasEmailOnly && !row.email) continue;
    if (filters.excludeSpark && sparkInstalled) continue;
    if (filters.planKey && row.planKey !== filters.planKey) continue;
    rows.push(row);
  }

  return {
    shops: rows,
    summary: {
      total: rows.length,
      withEmail: rows.filter((row) => row.email).length,
      missingEmail: rows.filter((row) => !row.email).length,
      sparkInstalled: rows.filter((row) => row.sparkInstalled).length,
    },
  };
}
