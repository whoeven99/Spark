import { Router } from "express";
import { normalizeShopName } from "../lib/shopSession.js";
import {
  decodeRenderLogsCursor,
  encodeRenderLogsCursor,
  fetchTsfWebLogs,
  isRenderLogsConfigured,
  resolveTsfWebServiceId,
  TSF_WEB_RENDER_SERVICES,
} from "../lib/renderLogs.js";
import {
  aggregateSingleTranslateLogs,
  type SingleLogKind,
  type SingleTranslateLogRecord,
} from "../lib/singleTranslateLogParse.js";

export const tsfSingleTranslateLogsRouter = Router();

const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;
const DEFAULT_WINDOW_MS = 24 * 3600_000;
const MAX_RECORD_LIMIT = 200;

function isValidShopName(shop: string): boolean {
  return SHOP_NAME_REGEX.test(shop.trim().toLowerCase());
}

function parseTypes(raw: string | undefined): SingleLogKind[] {
  const allowed = new Set<SingleLogKind>(["result", "request", "llm"]);
  const parts = (raw ?? "result,request,llm")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SingleLogKind => allowed.has(s as SingleLogKind));
  return parts.length > 0 ? parts : ["result", "request", "llm"];
}

tsfSingleTranslateLogsRouter.get("/config", (_req, res) => {
  res.json({
    configured: isRenderLogsConfigured(),
    mergeWindowSeconds: 60,
    defaultWindowHours: 24,
    environments: Object.values(TSF_WEB_RENDER_SERVICES).map((env) => ({
      key: env.key,
      label: env.label,
      serviceId: env.serviceId,
    })),
  });
});

tsfSingleTranslateLogsRouter.get("/", async (req, res) => {
  if (!isRenderLogsConfigured()) {
    res.status(400).json({
      error: "Render 日志未配置（缺少 RENDER_API_KEY）",
      configured: false,
    });
    return;
  }

  const rawShop = (req.query.shop as string | undefined)?.trim() ?? "";
  const shop = normalizeShopName(rawShop);
  if (!shop) {
    res.status(400).json({ error: "shop 参数必填" });
    return;
  }
  if (!isValidShopName(shop)) {
    res.status(400).json({ error: "shop 必须是 *.myshopify.com 格式" });
    return;
  }

  const env = (req.query.env as string | undefined)?.trim() || "prod";
  const serviceId = resolveTsfWebServiceId(env);
  if (!serviceId) {
    res.status(400).json({ error: 'env 必须是 "prod" 或 "test"' });
    return;
  }

  const now = Date.now();
  const fromMs = Number(req.query.from ?? now - DEFAULT_WINDOW_MS);
  const toMs = Number(req.query.to ?? now);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    res.status(400).json({ error: "from / to 时间范围无效" });
    return;
  }

  const types = parseTypes(req.query.types as string | undefined);
  const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
  const limit = Math.min(
    Number(req.query.limit ?? 50) || 50,
    MAX_RECORD_LIMIT,
  );
  const cursor = decodeRenderLogsCursor(req.query.cursor as string | undefined);

  try {
    const { entries, hasMore, cursor: nextCursor } = await fetchTsfWebLogs({
      serviceId,
      shop,
      startTime: new Date(fromMs).toISOString(),
      endTime: new Date(toMs).toISOString(),
      cursor,
    });

    const records: SingleTranslateLogRecord[] = aggregateSingleTranslateLogs({
      entries,
      shop,
      types,
      keyword,
      limit,
    });

    res.json({
      shop,
      env: env === "test" ? "test" : "prod",
      from: fromMs,
      to: toMs,
      types,
      records,
      hasMore,
      cursor: nextCursor ? encodeRenderLogsCursor(nextCursor) : null,
      fetchedLogLines: entries.length,
      note:
        entries.length === 0
          ? "该时间窗内未找到匹配日志；单字段翻译仅写入 TSF Web 容器，且 Render 保留期有限。"
          : undefined,
    });
  } catch (err) {
    console.error("[tsf/single-translate-logs]", err);
    res.status(500).json({ error: String(err) });
  }
});
