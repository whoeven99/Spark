import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";
import { normalizeShopName } from "../lib/shopSession.js";

export const tsfSingleTranslateLogsRouter = Router();

const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;
const DEFAULT_WINDOW_MS = 24 * 3600_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SingleTranslateCreditMeta = {
  rawTokens?: number | null;
  googleCredits?: number | null;
  aiModel?: string | null;
  target?: string | null;
  sourceLocale?: string | null;
  fieldKey?: string | null;
  shopifyType?: string | null;
  textLength?: number | null;
};

export type SingleTranslateCreditRecord = {
  id: string;
  shop: string;
  credits: number;
  referenceId: string;
  createdAt: string;
  metadata: SingleTranslateCreditMeta;
};

type ListCursor = {
  createdAt: string;
  id: string;
};

function isValidShopName(shop: string): boolean {
  return SHOP_NAME_REGEX.test(shop.trim().toLowerCase());
}

function resolveShopQuery(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? value;
  return normalizeShopName(value);
}

function parseMetadata(raw: unknown): SingleTranslateCreditMeta {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const row = parsed as Record<string, unknown>;
  const readString = (key: string): string | null => {
    const v = row[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const readNumber = (key: string): number | null => {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    return null;
  };
  return {
    rawTokens: readNumber("rawTokens"),
    googleCredits: readNumber("googleCredits"),
    aiModel: readString("aiModel"),
    target: readString("target"),
    sourceLocale: readString("sourceLocale"),
    fieldKey: readString("fieldKey"),
    shopifyType: readString("shopifyType"),
    textLength: readNumber("textLength"),
  };
}

function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): ListCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), "base64url").toString("utf8"),
    ) as ListCursor;
    if (
      typeof parsed.createdAt === "string" &&
      parsed.createdAt &&
      typeof parsed.id === "string" &&
      parsed.id
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function mapRow(row: Record<string, unknown>): SingleTranslateCreditRecord {
  return {
    id: String(row.id),
    shop: String(row.shop),
    credits: Number(row.credits ?? 0),
    referenceId: String(row.referenceId),
    createdAt: String(row.createdAt),
    metadata: parseMetadata(row.metadata),
  };
}

tsfSingleTranslateLogsRouter.get("/config", (_req, res) => {
  res.json({
    source: "credit_usage",
    defaultWindowHours: 24,
    maxLimit: MAX_LIMIT,
  });
});

/**
 * 只读查询 TSF Turso CreditUsage（source=single）。
 * GET /api/tsf/single-translate-logs?shop=&from=&to=&keyword=&limit=&cursor=
 */
tsfSingleTranslateLogsRouter.get("/", async (req, res) => {
  const rawShop = (req.query.shop as string | undefined)?.trim() ?? "";
  const shop = resolveShopQuery(rawShop);
  if (!shop) {
    res.status(400).json({ error: "shop 参数必填" });
    return;
  }
  if (!isValidShopName(shop)) {
    res.status(400).json({ error: "shop 必须是 *.myshopify.com 格式" });
    return;
  }

  const now = Date.now();
  const fromMs = Number(req.query.from ?? now - DEFAULT_WINDOW_MS);
  const toMs = Number(req.query.to ?? now);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    res.status(400).json({ error: "from / to 时间范围无效" });
    return;
  }

  const limit = Math.min(
    Math.max(Number(req.query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
  const cursor = decodeCursor(req.query.cursor as string | undefined);
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  try {
    const db = getTsfDb();

    const statsResult = await db.execute({
      sql: `
        SELECT
          COUNT(*) AS totalCount,
          COALESCE(SUM(credits), 0) AS totalCredits,
          COALESCE(SUM(CAST(json_extract(metadata, '$.rawTokens') AS INTEGER)), 0) AS totalRawTokens
        FROM CreditUsage
        WHERE shop = ?
          AND source = 'single'
          AND createdAt >= ?
          AND createdAt <= ?
      `,
      args: [shop, fromIso, toIso],
    });
    const statsRow = statsResult.rows[0] ?? {};
    const stats = {
      totalCount: Number(statsRow.totalCount ?? 0),
      totalCredits: Number(statsRow.totalCredits ?? 0),
      totalRawTokens: Number(statsRow.totalRawTokens ?? 0),
    };

    const args: (string | number)[] = [shop, fromIso, toIso];
    let keywordSql = "";
    if (keyword) {
      const like = `%${keyword}%`;
      keywordSql = `
        AND (
          json_extract(metadata, '$.fieldKey') LIKE ?
          OR json_extract(metadata, '$.shopifyType') LIKE ?
          OR json_extract(metadata, '$.aiModel') LIKE ?
          OR json_extract(metadata, '$.target') LIKE ?
          OR json_extract(metadata, '$.sourceLocale') LIKE ?
          OR referenceId LIKE ?
        )
      `;
      args.push(like, like, like, like, like, like);
    }

    let cursorSql = "";
    if (cursor) {
      cursorSql = `
        AND (
          createdAt < ?
          OR (createdAt = ? AND id < ?)
        )
      `;
      args.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }

    args.push(limit + 1);

    const listResult = await db.execute({
      sql: `
        SELECT id, shop, credits, referenceId, metadata, createdAt
        FROM CreditUsage
        WHERE shop = ?
          AND source = 'single'
          AND createdAt >= ?
          AND createdAt <= ?
          ${keywordSql}
          ${cursorSql}
        ORDER BY createdAt DESC, id DESC
        LIMIT ?
      `,
      args,
    });

    const rows = listResult.rows.map((row) =>
      mapRow(row as Record<string, unknown>),
    );
    const hasMore = rows.length > limit;
    const records = hasMore ? rows.slice(0, limit) : rows;
    const last = records[records.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    let note: string | undefined;
    if (stats.totalCount === 0) {
      note =
        "该时间窗内无单字段扣费审计记录；CreditUsage 自单字段扣费接入后才有数据，不含原文/译文。";
    } else if (records.length === 0 && keyword) {
      note = `时间窗内共 ${stats.totalCount} 条记录，但关键字「${keyword}」无匹配。`;
    }

    res.json({
      shop,
      from: fromMs,
      to: toMs,
      keyword: keyword || null,
      records,
      stats,
      hasMore,
      cursor: nextCursor,
      note,
    });
  } catch (err) {
    console.error("[tsf/single-translate-logs]", err);
    res.status(500).json({ error: String(err) });
  }
});
