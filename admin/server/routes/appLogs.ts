/// <reference path="../types/alicloud-log.d.ts" />
import { Router } from "express";
import { getPixelLogSlsConfig, getPixelLogSlsClient } from "../lib/pixelLogSls.js";
import type { SlsHistogramBucket, SlsLogRecord } from "@alicloud/log";

export const appLogsRouter = Router();

/** SLS GetLogs 单次返回上限。 */
const MAX_PAGE_SIZE = 100;
/** SDK 默认 read timeout 仅 3s，endpoint 在海外时不够用。 */
const SLS_REQUEST_OPTIONS = { timeout: 30_000 };
/** 默认查询窗口：最近 24 小时。 */
const DEFAULT_WINDOW_MS = 24 * 3600_000;

/** 嵌入式 App 功能埋点统一 topic（见主应用 featureTrack.server.ts）。 */
const APP_FEATURE_TOPIC = "spark:app:feature";

/** 合法 Shopify 店铺域名。 */
const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;

function isValidShopName(shop: string): boolean {
  return SHOP_NAME_REGEX.test(shop.trim().toLowerCase());
}

/** 字段值转 SLS 查询字面量：转义双引号，外层加引号。 */
function quoteSls(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildQuery(filters: {
  shop?: string;
  feature?: string;
  action?: string;
  keyword?: string;
}): string {
  const parts: string[] = [];
  if (filters.shop) parts.push(`shopName: ${quoteSls(filters.shop.toLowerCase())}`);
  if (filters.feature) parts.push(`feature: ${quoteSls(filters.feature)}`);
  if (filters.action) parts.push(`action: ${quoteSls(filters.action)}`);
  if (filters.keyword) parts.push(quoteSls(filters.keyword));
  return parts.join(" and ");
}

/** 当前 SLS 配置状态（不暴露 AK）。 */
appLogsRouter.get("/config", (_req, res) => {
  const cfg = getPixelLogSlsConfig();
  res.json({
    configured: cfg !== null,
    project: cfg?.project ?? null,
    logstore: cfg?.logstore ?? null,
  });
});

/**
 * 查询 Spark App 功能埋点日志。
 *
 * 通过 SLS topic 精确过滤 `spark:app:feature`（无需字段索引），再叠加 content 字段筛选：
 * - shop / feature / action：SLS 字段查询（需 logstore 已开启字段索引）
 * - keyword：全文关键字
 * - from / to：毫秒时间戳，缺省最近 24 小时
 * - page / pageSize：分页（pageSize 上限 100，受 SLS GetLogs 限制）
 */
appLogsRouter.get("/", async (req, res) => {
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

  const feature = (req.query.feature as string | undefined)?.trim();
  const action = (req.query.action as string | undefined)?.trim();
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

  const query = buildQuery({ shop, feature, action, keyword });
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
          topic: APP_FEATURE_TOPIC,
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
          topic: APP_FEATURE_TOPIC,
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

    const logs = (records as SlsLogRecord[] ?? []).map(
      (r: SlsLogRecord, i: number) => {
        const {
          __time__,
          __topic__,
          __source__,
          event,
          shopName,
          feature: featureField,
          action: actionField,
          path,
          plan,
          source,
          schemaVersion,
          payload,
          ...rest
        } = r;
        return {
          id: `${__time__ ?? ""}-${(page - 1) * pageSize + i}`,
          time: Number(__time__ ?? 0) * 1000,
          event: event || __topic__ || "",
          shopName: (shopName ?? __source__ ?? "").trim().toLowerCase(),
          feature: featureField ?? "",
          action: actionField ?? "",
          path: path ?? "",
          plan: plan ?? "",
          source: source ?? "",
          schemaVersion: schemaVersion ?? "",
          payload: payload ?? "",
          extra: rest,
        };
      },
    );

    res.json({
      logs,
      total,
      complete,
      project: config.project,
      logstore: config.logstore,
    });
  } catch (err) {
    const e = err as Error & { code?: string; requestid?: string };
    console.error("[app-logs] query failed:", err);
    res.status(502).json({
      error: `SLS 查询失败：${e.code ? `[${e.code}] ` : ""}${e.message}`,
    });
  }
});
