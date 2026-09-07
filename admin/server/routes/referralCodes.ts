import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getDb, isSparkDbConfigured } from "../lib/db.js";
import {
  resolveReferralClaimShops,
  type ReferralClaimRow,
} from "../lib/referralClaimShop.js";
import { buildReferralInstallUrl } from "../lib/sparkAppUrl.js";
import {
  isUnlimitedReferralCap,
  referralRemaining,
  resolveReferralStatus,
} from "../lib/referralCodeView.js";

export const referralCodesRouter = Router();

const CODE_PATTERN = /^[A-Z0-9-]{6,20}$/;
const DEFAULT_TOKEN_AMOUNT = 1_000_000;
const DEFAULT_MAX_USES = 1_000_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += ALPHABET[byte % ALPHABET.length];
  }
  return `SPARK-${suffix}`;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

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

function mapClaimRows(rows: unknown[]): ReferralClaimRow[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      shopHash: String(record.shopHash ?? ""),
      tokensDelta: Number(record.tokensDelta ?? 0),
      claimedAt: isoOrNull(record.claimedAt),
    };
  });
}

function mapInstallShopsByHash(rows: unknown[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    const shopHash = String(record.shopHash ?? "");
    if (!shopHash) continue;
    map.set(shopHash, stringOrNull(record.shop));
  }
  return map;
}

async function loadReferralClaimItems(
  db: ReturnType<typeof getDb>,
  codeId: string,
  code: string,
) {
  const claimsResult = await db.execute({
    sql: `
      SELECT shopHash, tokensDelta, claimedAt
      FROM ReferralClaim
      WHERE codeId = ?
      ORDER BY claimedAt DESC
    `,
    args: [codeId],
  });
  const claims = mapClaimRows(claimsResult.rows);
  if (claims.length === 0) return [];

  const logs = await db.execute({
    sql: `
      SELECT shop FROM BillingLog
      WHERE eventType = 'REFERRAL_CODE_CLAIMED' AND referenceId = ?
    `,
    args: [code],
  });
  const billingLogShops = logs.rows.map((row) =>
    stringOrNull((row as Record<string, unknown>).shop),
  );
  const hashes = claims.map((claim) => claim.shopHash).filter(Boolean);
  const installShopsByHash = await loadInstallShopsByHash(db, hashes);
  const sources = { claims, billingLogShops, installShopsByHash, accountShops: [] as Array<string | null> };
  const items = resolveReferralClaimShops(sources);
  if (!items.some((item) => !item.shop)) return items;

  const accounts = await db.execute({ sql: `SELECT shop FROM Account`, args: [] });
  return resolveReferralClaimShops({
    ...sources,
    accountShops: accounts.rows.map((row) =>
      stringOrNull((row as Record<string, unknown>).shop),
    ),
  });
}

async function loadInstallShopsByHash(
  db: ReturnType<typeof getDb>,
  hashes: string[],
) {
  if (hashes.length === 0) return new Map<string, string | null>();
  const placeholders = hashes.map(() => "?").join(",");
  const installs = await db.execute({
    sql: `SELECT shopHash, shop FROM ReferralInstall WHERE shopHash IN (${placeholders})`,
    args: hashes,
  });
  return mapInstallShopsByHash(installs.rows);
}

type ReferralCodeRow = {
  id: string;
  code: string;
  note: string | null;
  tokenAmount: number;
  maxUses: number;
  usedCount: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};


function mapCodeRow(raw: Record<string, unknown>): ReferralCodeRow {
  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    note: raw.note == null ? null : String(raw.note),
    tokenAmount: Number(raw.tokenAmount ?? 0),
    maxUses: Number(raw.maxUses ?? 0),
    usedCount: Number(raw.usedCount ?? 0),
    enabled: Boolean(raw.enabled),
    startsAt: isoOrNull(raw.startsAt),
    endsAt: isoOrNull(raw.endsAt),
    createdBy: raw.createdBy == null ? null : String(raw.createdBy),
    createdAt: isoOrNull(raw.createdAt) ?? "",
    updatedAt: isoOrNull(raw.updatedAt) ?? "",
  };
}


function withStatus(
  row: ReferralCodeRow,
  extras: { nowMs?: number; installCount?: number } = {},
) {
  const unlimited = isUnlimitedReferralCap(row.maxUses);
  return {
    ...row,
    unlimited,
    remaining: referralRemaining(row.maxUses, row.usedCount),
    status: resolveReferralStatus({ ...row, nowMs: extras.nowMs ?? Date.now() }),
    installCount: extras.installCount ?? 0,
    installUrl: buildReferralInstallUrl(row.code),
  };
}

function parseMaxUsesOrError(value: unknown): number | "invalid" {
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_USES;
  const parsed = parsePositiveInt(value);
  if (parsed == null || parsed <= 0) return "invalid";
  return parsed;
}

referralCodesRouter.get("/", async (_req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  try {
    const db = getDb();
    const result = await db.execute({
      sql: `
        SELECT id, code, note, tokenAmount, maxUses, usedCount, enabled,
               startsAt, endsAt, createdBy, createdAt, updatedAt
        FROM ReferralCode
        ORDER BY createdAt DESC
      `,
      args: [],
    });
    const nowMs = Date.now();
    const countResult = await db.execute({
      sql: `SELECT codeId, COUNT(*) AS installCount FROM ReferralInstall GROUP BY codeId`,
      args: [],
    });
    const installCountById = new Map<string, number>();
    for (const row of countResult.rows) {
      const record = row as Record<string, unknown>;
      installCountById.set(String(record.codeId ?? ""), Number(record.installCount ?? 0));
    }
    const items = result.rows.map((row) => {
      const mapped = mapCodeRow(row as Record<string, unknown>);
      return withStatus(mapped, {
        nowMs,
        installCount: installCountById.get(mapped.id) ?? 0,
      });
    });
    const activeCount = items.filter((item) => item.status === "active").length;
    const totalRedeemed = items.reduce((sum, item) => sum + item.usedCount, 0);
    const unlimitedActiveCount = items.filter(
      (item) => item.status === "active" && item.unlimited,
    ).length;
    const remainingSlots = items.reduce((sum, item) => {
      if (!item.enabled || item.remaining == null) return sum;
      return sum + item.remaining;
    }, 0);
    res.json({
      items,
      summary: { activeCount, totalRedeemed, remainingSlots, unlimitedActiveCount },
    });
  } catch (error) {
    console.error("[referral-codes]", error);
    res.status(500).json({ error: String(error) });
  }
});

referralCodesRouter.post("/", async (req, res) => {
  if (!isSparkDbConfigured()) {
    res.status(503).json({ error: "Spark Turso 未配置" });
    return;
  }

  const rawCode =
    typeof req.body?.code === "string" ? normalizeCode(req.body.code) : "";
  const code = rawCode || generateCode();
  if (!CODE_PATTERN.test(code)) {
    res.status(400).json({ error: "推荐码须为 6–20 位大写字母、数字或连字符" });
    return;
  }

  const note =
    typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
  const tokenAmount = parsePositiveInt(req.body?.tokenAmount) ?? DEFAULT_TOKEN_AMOUNT;
  const maxUses = parseMaxUsesOrError(req.body?.maxUses);
  const startsAt = parseOptionalDate(req.body?.startsAt);
  const endsAt = parseOptionalDate(req.body?.endsAt);
  const createdBy =
    typeof res.locals.adminUserLabel === "string"
      ? res.locals.adminUserLabel
      : null;

  if (tokenAmount <= 0) {
    res.status(400).json({ error: "奖励 Token 必须为正整数" });
    return;
  }
  if (maxUses === "invalid") {
    res.status(400).json({ error: "使用上限须为正整数，默认 1000000" });
    return;
  }
  if (startsAt === undefined || endsAt === undefined) {
    res.status(400).json({ error: "起止时间格式无效" });
    return;
  }

  try {
    const db = getDb();
    const id = randomUUID();
    await db.execute({
      sql: `
        INSERT INTO ReferralCode
          (id, code, note, tokenAmount, maxUses, usedCount, enabled, startsAt, endsAt, createdBy, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [id, code, note || null, tokenAmount, maxUses, startsAt, endsAt, createdBy],
    });
    const created = await db.execute({
      sql: `
        SELECT id, code, note, tokenAmount, maxUses, usedCount, enabled,
               startsAt, endsAt, createdBy, createdAt, updatedAt
        FROM ReferralCode WHERE id = ?
      `,
      args: [id],
    });
    const row = created.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(500).json({ error: "创建成功但读取失败" });
      return;
    }
    res.json(withStatus(mapCodeRow(row)));
  } catch (error) {
    const message = String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      res.status(409).json({ error: "推荐码已存在" });
      return;
    }
    console.error("[referral-codes] create", error);
    res.status(500).json({ error: message });
  }
});

referralCodesRouter.patch("/:id", async (req, res) => {
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
    const currentResult = await db.execute({
      sql: `
        SELECT id, code, note, tokenAmount, maxUses, usedCount, enabled,
               startsAt, endsAt, createdBy, createdAt, updatedAt
        FROM ReferralCode WHERE id = ?
      `,
      args: [id],
    });
    const currentRaw = currentResult.rows[0] as Record<string, unknown> | undefined;
    if (!currentRaw) {
      res.status(404).json({ error: "推荐码不存在" });
      return;
    }
    const current = mapCodeRow(currentRaw);

    let nextMaxUses = current.maxUses;
    if (req.body?.maxUses !== undefined) {
      const parsed = parseMaxUsesOrError(req.body.maxUses);
      if (parsed === "invalid") {
        res.status(400).json({ error: "使用上限须为正整数，默认 1000000" });
        return;
      }
      if (parsed > 0 && parsed < current.usedCount) {
        res.status(400).json({ error: `使用上限不能低于已兑次数 ${current.usedCount}` });
        return;
      }
      nextMaxUses = parsed;
    }

    let nextEnabled = current.enabled;
    if (req.body?.enabled !== undefined) {
      nextEnabled = Boolean(req.body.enabled);
    }

    let nextNote = current.note;
    if (typeof req.body?.note === "string") {
      nextNote = req.body.note.trim().slice(0, 200) || null;
    }

    let nextTokenAmount = current.tokenAmount;
    if (req.body?.tokenAmount !== undefined) {
      if (current.usedCount > 0) {
        res.status(400).json({ error: "已有兑换记录后不能改奖励数量" });
        return;
      }
      const parsed = parsePositiveInt(req.body.tokenAmount);
      if (parsed == null || parsed <= 0) {
        res.status(400).json({ error: "奖励 Token 必须为正整数" });
        return;
      }
      nextTokenAmount = parsed;
    }

    await db.execute({
      sql: `
        UPDATE ReferralCode
        SET maxUses = ?, enabled = ?, note = ?, tokenAmount = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [nextMaxUses, nextEnabled ? 1 : 0, nextNote, nextTokenAmount, id],
    });

    const updated = await db.execute({
      sql: `
        SELECT id, code, note, tokenAmount, maxUses, usedCount, enabled,
               startsAt, endsAt, createdBy, createdAt, updatedAt
        FROM ReferralCode WHERE id = ?
      `,
      args: [id],
    });
    const row = updated.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(500).json({ error: "更新成功但读取失败" });
      return;
    }
    res.json(withStatus(mapCodeRow(row)));
  } catch (error) {
    console.error("[referral-codes] patch", error);
    res.status(500).json({ error: String(error) });
  }
});

referralCodesRouter.get("/:id/installs", async (req, res) => {
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
    const codeResult = await db.execute({
      sql: `SELECT code FROM ReferralCode WHERE id = ?`,
      args: [id],
    });
    if (!codeResult.rows[0]) {
      res.status(404).json({ error: "推荐码不存在" });
      return;
    }

    const installs = await db.execute({
      sql: `
        SELECT shopHash, shop, installedAt
        FROM ReferralInstall
        WHERE codeId = ?
        ORDER BY installedAt DESC
      `,
      args: [id],
    });

    res.json({
      items: installs.rows.map((row) => {
        const record = row as Record<string, unknown>;
        const shopHash = String(record.shopHash ?? "");
        return {
          shopHash,
          shopHashShort: shopHash.slice(0, 8),
          shop: record.shop == null ? null : String(record.shop),
          installedAt: isoOrNull(record.installedAt),
        };
      }),
    });
  } catch (error) {
    console.error("[referral-codes] installs", error);
    res.status(500).json({ error: String(error) });
  }
});

referralCodesRouter.get("/:id/claims", async (req, res) => {
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
    const codeResult = await db.execute({
      sql: `SELECT code FROM ReferralCode WHERE id = ?`,
      args: [id],
    });
    if (!codeResult.rows[0]) {
      res.status(404).json({ error: "推荐码不存在" });
      return;
    }

    const code = String(
      (codeResult.rows[0] as Record<string, unknown>).code ?? "",
    ).trim();
    const items = await loadReferralClaimItems(db, id, code);
    res.json({ items });
  } catch (error) {
    console.error("[referral-codes] claims", error);
    res.status(500).json({ error: String(error) });
  }
});
