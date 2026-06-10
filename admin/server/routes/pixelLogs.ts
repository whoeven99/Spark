/// <reference path="../types/alicloud-log.d.ts" />
import { Router } from "express";
import { getPixelLogSlsConfig, getPixelLogSlsClient } from "../lib/pixelLogSls.js";
import type { SlsHistogramBucket, SlsLogRecord } from "@alicloud/log";

export const pixelLogsRouter = Router();

/** SLS GetLogs 单次返回上限。 */
const MAX_PAGE_SIZE = 100;
/** SDK 默认 read timeout 仅 3s，endpoint 在海外时不够用。 */
const SLS_REQUEST_OPTIONS = { timeout: 30_000 };
/** 默认查询窗口：最近 24 小时。 */
const DEFAULT_WINDOW_MS = 24 * 3600_000;

/** 合法 Shopify 店铺域名，与 `pixelIngest.server.ts` 一致。 */
const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;

function isValidShopName(shop: string): boolean {
  return SHOP_NAME_REGEX.test(shop.trim().toLowerCase());
}

/**
 * 从 SLS 记录解析商店名：优先 shopName 字段，其次 __source__（ingest 写入时与 shopName 相同）。
 */
function resolveShopName(record: SlsLogRecord): string {
  const fromField = (record.shopName ?? "").trim().toLowerCase();
  if (fromField) return fromField;
  const fromSource = (record.__source__ ?? "").trim().toLowerCase();
  if (fromSource && fromSource !== "azure") return fromSource;
  return "";
}

/** 默认 SLS 查询：限定 webpixel 事件（logstore 与 azure 轨迹混存）。 */
const DEFAULT_PIXEL_QUERY = "event: spark";

/** 字段值转 SLS 查询字面量：转义双引号，外层加引号。 */
function quoteSls(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildQuery(filters: {
  shop?: string;
  clientId?: string;
  keyword?: string;
}): string {
  const parts: string[] = [DEFAULT_PIXEL_QUERY];
  // 字段查询比全文 "xxx.myshopify.com" 可靠（后者易命中 azure message 杂项且常返回 0 条）。
  if (filters.shop) {
    parts.push(`shopName: ${quoteSls(filters.shop.toLowerCase())}`);
  }
  if (filters.clientId) {
    parts.push(`clientId: ${quoteSls(filters.clientId)}`);
  }
  if (filters.keyword) parts.push(quoteSls(filters.keyword));
  return parts.join(" and ");
}

/** 当前 SLS 配置状态（不暴露 AK）。 */
pixelLogsRouter.get("/config", (_req, res) => {
  const cfg = getPixelLogSlsConfig();
  res.json({
    configured: cfg !== null,
    project: cfg?.project ?? null,
    logstore: cfg?.logstore ?? null,
  });
});

/**
 * 查询 webpixel 日志。
 *
 * 参数：
 * - shop / clientId：SLS 字段查询（需 logstore 已开启字段索引）
 * - event：SLS topic 精确过滤（无需索引），如 spark:shopify:page_viewed
 * - keyword：全文关键字
 * - from / to：毫秒时间戳，缺省最近 24 小时
 * - page / pageSize：分页（pageSize 上限 100，受 SLS GetLogs 限制）
 */
pixelLogsRouter.get("/", async (req, res) => {
  const sls = getPixelLogSlsClient();
  if (!sls) {
    res.status(400).json({
      error:
        "阿里云日志未配置（缺少 ALIBABA_CLOUD_ACCESS_KEY_ID / ACCESS_KEY_SECRET / ENDPOINT）",
    });
    return;
  }

  const shop = (req.query.shop as string | undefined)?.trim().toLowerCase();
  if (shop && !isValidShopName(shop)) {
    res.status(400).json({ error: "shop 必须是 *.myshopify.com 格式" });
    return;
  }

  const clientId = (req.query.clientId as string | undefined)?.trim();
  const event = (req.query.event as string | undefined)?.trim();
  const keyword = (req.query.keyword as string | undefined)?.trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(req.query.pageSize ?? 50) || 50),
  );

  const now = Date.now();
  const fromMs = Number(req.query.from) || now - DEFAULT_WINDOW_MS;
  const toMs = Number(req.query.to) || now;
  if (fromMs >= toMs) {
    res.status(400).json({ error: "时间范围无效：from 必须早于 to" });
    return;
  }

  const query = buildQuery({ shop, clientId, keyword });
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const { client, config } = sls;

  try {
    const [records, histograms] = await Promise.all([
      client.getLogs(
        config.project,
        config.logstore,
        from,
        to,
        {
          query: query || undefined,
          topic: event || undefined,
          line: pageSize,
          offset: (page - 1) * pageSize,
          reverse: true,
        },
        SLS_REQUEST_OPTIONS,
      ),
      client.getHistograms(
        config.project,
        config.logstore,
        from,
        to,
        {
          query: query || undefined,
          topic: event || undefined,
        },
        SLS_REQUEST_OPTIONS,
      ),
    ]);

    const total = (histograms as SlsHistogramBucket[]).reduce(
      (sum: number, b: SlsHistogramBucket) => sum + (b.count || 0),
      0,
    );
    const complete = (histograms as SlsHistogramBucket[]).every(
      (b: SlsHistogramBucket) => b.progress === "Complete",
    );

    const logs = (records as SlsLogRecord[] ?? [])
      .map((r: SlsLogRecord, i: number) => {
        const {
          __time__,
          __topic__,
          event: eventField,
          clientId: cid,
          source,
          productId,
          payload,
          schemaVersion,
          ...rest
        } = r;
        const normalizedShop = resolveShopName(r);
        return {
          id: `${__time__ ?? ""}-${(page - 1) * pageSize + i}`,
          time: Number(__time__ ?? 0) * 1000,
          event: eventField || __topic__ || "",
          shopName: normalizedShop,
          clientId: cid ?? "",
          source: source ?? "",
          productId: productId ?? "",
          schemaVersion: schemaVersion ?? "",
          payload: payload ?? "",
          extra: rest,
        };
      });

    res.json({
      logs,
      total,
      complete,
      project: config.project,
      logstore: config.logstore,
    });
  } catch (err) {
    const e = err as Error & { code?: string; requestid?: string };
    console.error("[pixel-logs] query failed:", err);
    res.status(502).json({
      error: `SLS 查询失败：${e.code ? `[${e.code}] ` : ""}${e.message}`,
    });
  }
});
