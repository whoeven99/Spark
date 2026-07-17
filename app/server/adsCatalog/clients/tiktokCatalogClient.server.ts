import type { TiktokCatalogItem } from "../mappers/shopifyToTiktok";
import { isShopifyOfficialCatalog } from "../tiktokOAuth.server";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const ITEMS_BATCH_CHUNK = 50;
const LOG_PREFIX = "[AdsCatalog][TikTokClient]";

/** 原始返回日志上限：单店同步体量小，放宽截断以便排障拿到完整 TikTok 响应。 */
const RAW_LOG_MAX = 20000;

function rawForLog(text: string): string {
  if (text.length <= RAW_LOG_MAX) return text;
  return `${text.slice(0, RAW_LOG_MAX)}...(+${text.length - RAW_LOG_MAX} chars truncated)`;
}

/**
 * TikTok Catalog upload API 限速：每个 Catalog 每分钟仅允许提交一次。
 * 进程内 Map 记录最近上传时间；重启后自动重置（已足够，因为重启间隔通常 > 1 分钟）。
 */
const catalogLastUploadMs = new Map<string, number>();
const UPLOAD_COOLDOWN_MS = 62_000;

async function waitForUploadCooldown(catalogId: string): Promise<void> {
  const last = catalogLastUploadMs.get(catalogId);
  if (!last) return;
  const remaining = UPLOAD_COOLDOWN_MS - (Date.now() - last);
  if (remaining <= 0) return;
  console.info(
    `${LOG_PREFIX} step=rate_limit_cooldown catalogId=${catalogId} waitMs=${remaining}`,
  );
  await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}

function summarizeTiktokItem(item: TiktokCatalogItem): Record<string, unknown> {
  return {
    sku_id: item.sku_id,
    title: item.title.slice(0, 80),
    availability: item.availability,
    price: item.price_info.price,
    currency: item.price_info.currency,
    brand: item.brand,
    condition: item.product_detail.condition,
    landing_page_url: item.landing_page.landing_page_url,
    image_url: item.image_url,
    item_group_id: item.item_group_id,
    google_product_category: item.google_product_category,
    product_type: item.product_type,
    product_category: item.product_detail.product_category,
  };
}

export interface TiktokCatalogConfSnapshot {
  catalogId: string;
  catalogName?: string;
  catalogType?: string;
  currency?: string;
  regionCode?: string;
  channel?: string;
  businessPlatform?: string;
  isShopifyOfficial: boolean;
}

/** 读取已绑定 Catalog 的币种/区域/channel，用于上传前校验与失败诊断。 */
export async function fetchTiktokCatalogConf(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
}): Promise<TiktokCatalogConfSnapshot | null> {
  const url = new URL(`${TIKTOK_API_BASE}/catalog/get/`);
  url.searchParams.set("bc_id", params.bcId);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");

  const response = await fetch(url.toString(), {
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: { list?: Array<Record<string, unknown>>; catalogs?: Array<Record<string, unknown>> };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=catalog_get_response catalogId=${params.catalogId} http=${response.status} code=${payload.code ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    return null;
  }

  const rows = payload.data?.list ?? payload.data?.catalogs ?? [];
  const row = rows.find((item) => String(item.catalog_id ?? "").trim() === params.catalogId);
  if (!row) return null;

  const conf = (row.catalog_conf as Record<string, unknown> | undefined) ?? {};
  const catalogName = String(row.catalog_name ?? "").trim() || undefined;
  const catalogType = String(row.catalog_type ?? "").trim() || undefined;
  const currency = String(conf.currency ?? row.currency ?? "").trim().toUpperCase() || undefined;
  const regionCode =
    String(conf.region_code ?? row.region_code ?? "").trim().toUpperCase() || undefined;
  const channel = String(conf.channel ?? row.channel ?? "").trim().toUpperCase() || undefined;
  const businessPlatform =
    String(conf.business_platform ?? row.business_platform ?? "").trim() || undefined;

  return {
    catalogId: params.catalogId,
    catalogName,
    catalogType,
    currency,
    regionCode,
    channel,
    businessPlatform,
    isShopifyOfficial: isShopifyOfficialCatalog({
      catalogName,
      catalogType,
      businessPlatform,
      channel,
      createSource: String(row.create_source ?? "").trim() || undefined,
    }),
  };
}

export function formatTiktokCatalogDiagnostics(conf: TiktokCatalogConfSnapshot): string {
  const parts = [`catalog_id=${conf.catalogId}`];
  if (conf.catalogName) parts.push(`name=${conf.catalogName}`);
  if (conf.currency) parts.push(`currency=${conf.currency}`);
  if (conf.regionCode) parts.push(`region=${conf.regionCode}`);
  if (conf.channel) parts.push(`channel=${conf.channel}`);
  else parts.push("channel=(missing)");
  if (conf.catalogType) parts.push(`type=${conf.catalogType}`);
  if (conf.businessPlatform) parts.push(`platform=${conf.businessPlatform}`);
  return parts.join(" ");
}

/** catalog/get 必须明确返回 channel=CLIENT；缺失 channel 视为不可 API 写入（常见于后台手动建库）。 */
export function isApiWritableTiktokCatalog(conf: {
  channel?: string;
  isShopifyOfficial: boolean;
}): boolean {
  if (conf.isShopifyOfficial) return false;
  return conf.channel === "CLIENT";
}

/** 上传前硬校验：官方 Shopify 目录与币种不一致会直接阻断。 */
export function validateTiktokCatalogForApiUpload(
  conf: TiktokCatalogConfSnapshot,
  productCurrency?: string,
): string | null {
  if (conf.isShopifyOfficial) {
    return "当前目录为 TikTok Shopify 官方同步目录，API 无法写入。请在 Spark 点击「创建 Spark API 商品库」后重新同步。";
  }
  if (
    productCurrency &&
    conf.currency &&
    conf.currency.toUpperCase() !== productCurrency.toUpperCase()
  ) {
    return `商品库币种为 ${conf.currency}，与店铺/商品价格币种 ${productCurrency.toUpperCase()} 不一致。请创建与店铺币种一致的 Spark API 商品库。`;
  }
  if (!isApiWritableTiktokCatalog(conf)) {
    const channelLabel = conf.channel ? `channel=${conf.channel}` : "channel 未返回（多为 TikTok 后台手动创建）";
    return `当前商品库 ${channelLabel}，无法通过 API 入库。请使用 Spark 创建的 API 商品库（channel=CLIENT）。`;
  }
  return null;
}

const CURRENCY_TO_REGION: Record<string, string> = {
  USD: "US",
  CAD: "CA",
  GBP: "GB",
  EUR: "DE",
  AUD: "AU",
  NZD: "NZ",
  JPY: "JP",
  CNY: "CN",
  HKD: "HK",
  TWD: "TW",
  SGD: "SG",
  MYR: "MY",
  THB: "TH",
  PHP: "PH",
  IDR: "ID",
  VND: "VN",
  KRW: "KR",
  INR: "IN",
  BRL: "BR",
  MXN: "MX",
};

/** 由店铺币种 + 国家推断 Catalog 创建所需 currency + region_code；国家优先于币种默认表。 */
export function resolveTiktokCatalogRegion(
  currencyCode?: string,
  countryCode?: string,
): {
  currency: string;
  regionCode: string;
} {
  const currency = (currencyCode || "USD").trim().toUpperCase() || "USD";
  const country = countryCode?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(country)) {
    return { currency, regionCode: country };
  }
  return {
    currency,
    regionCode: CURRENCY_TO_REGION[currency] || "US",
  };
}

export interface TiktokBatchResult {
  totalRequested: number;
  totalProcessed: number;
  errors: Array<{ id: string; reason: string }>;
  feedLogId?: string;
}

export interface CreateTiktokCatalogResult {
  catalogId: string;
  catalogName: string;
}

/**
 * Create an API-managed ECOM catalog under a Business Center.
 *
 * POST /open_api/v1.3/catalog/create/
 */
export async function createTiktokCatalog(params: {
  accessToken: string;
  bcId: string;
  name: string;
  currency?: string;
  /** 店铺国家（ISO2），优先于币种默认区域。 */
  countryCode?: string;
  regionCode?: string;
}): Promise<CreateTiktokCatalogResult> {
  const { currency, regionCode } = resolveTiktokCatalogRegion(
    params.currency,
    params.countryCode,
  );
  const region = (params.regionCode || regionCode).trim().toUpperCase() || regionCode;
  const name = params.name.trim() || "Spark Catalog";

  console.info(
    `${LOG_PREFIX} step=catalog_create_request bcId=${params.bcId} name=${JSON.stringify(name)} currency=${currency} region=${region}`,
  );

  const response = await fetch(`${TIKTOK_API_BASE}/catalog/create/`, {
    method: "POST",
    headers: {
      "Access-Token": params.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bc_id: params.bcId,
      name,
      catalog_type: "ECOM",
      catalog_conf: {
        currency,
        region_code: region,
        channel: "CLIENT",
      },
    }),
  });

  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: { catalog_id?: string | number };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    console.error(
      `${LOG_PREFIX} step=catalog_create_failed http=${response.status} detail=${detail} body=${text.slice(0, 500)}`,
    );
    throw new Error(`TikTok Catalog create failed: HTTP ${response.status} ${detail}`.trim());
  }

  const catalogId = String(payload.data?.catalog_id ?? "").trim();
  if (!catalogId) {
    throw new Error("TikTok Catalog create returned no catalog_id");
  }
  console.info(`${LOG_PREFIX} step=catalog_create_ok catalogId=${catalogId} name=${JSON.stringify(name)}`);
  return { catalogId, catalogName: name };
}

/**
 * Push a batch of catalog items to TikTok Catalog API.
 *
 * Endpoint:
 *   POST /open_api/v1.3/catalog/product/upload/
 *   Header: Access-Token
 *   Body: { bc_id, catalog_id, products: [...] }
 *
 * ECOM product objects use JSON schema fields (price_info / landing_page /
 * image_url / product_detail), not feed CSV names (price / link / image_link).
 * Same sku_id replaces an existing product (upsert semantics).
 */
export async function upsertTiktokCatalogItems(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  items: TiktokCatalogItem[];
}): Promise<TiktokBatchResult> {
  const result: TiktokBatchResult = {
    totalRequested: params.items.length,
    totalProcessed: 0,
    errors: [],
  };

  const url = `${TIKTOK_API_BASE}/catalog/product/upload/`;
  console.info(
    `${LOG_PREFIX} step=product_upload_start bcId=${params.bcId} advertiserId=${params.advertiserId} catalogId=${params.catalogId} itemCount=${params.items.length}`,
  );
  if (params.items[0]) {
    console.info(
      `${LOG_PREFIX} step=product_upload_sample ${JSON.stringify(summarizeTiktokItem(params.items[0]))}`,
    );
  }

  for (let offset = 0; offset < params.items.length; offset += ITEMS_BATCH_CHUNK) {
    const chunk = params.items.slice(offset, offset + ITEMS_BATCH_CHUNK);
    console.info(
      `${LOG_PREFIX} step=product_upload_chunk offset=${offset} size=${chunk.length} skus=${chunk
        .map((i) => i.sku_id)
        .join(",")}`,
    );

    await waitForUploadCooldown(params.catalogId);

    const requestBody = JSON.stringify({
      bc_id: params.bcId,
      catalog_id: params.catalogId,
      // advertiser_id is accepted by some catalog APIs; keep for compatibility.
      advertiser_id: params.advertiserId,
      products: chunk,
    });
    console.info(
      `${LOG_PREFIX} step=product_upload_request offset=${offset} body=${rawForLog(requestBody)}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });
    } catch (e) {
      const reason = `network error: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`${LOG_PREFIX} step=product_upload_network_error offset=${offset} ${reason}`);
      for (const item of chunk) {
        result.errors.push({ id: item.sku_id, reason });
      }
      continue;
    }

    const text = await response.text();
    let payload: {
      code?: number;
      message?: string;
      request_id?: string;
      data?: {
        failed_sku_ids?: string[];
        failed_item_ids?: string[];
        feed_log_id?: string | number;
      };
    } = {};
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    } catch {
      payload = {};
    }

    console.info(
      `${LOG_PREFIX} step=product_upload_response offset=${offset} http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} request_id=${payload.request_id ?? ""} feed_log_id=${payload.data?.feed_log_id ?? ""} body=${rawForLog(text)}`,
    );

    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      const apiPart =
        payload.code !== undefined
          ? `code=${payload.code}${payload.message ? ` ${payload.message}` : ""}`
          : payload.message || text.slice(0, 200) || response.statusText;
      const reason = `TikTok Catalog upload failed: HTTP ${response.status}${apiPart ? ` ${apiPart}` : ""}`;
      console.error(`${LOG_PREFIX} step=product_upload_chunk_failed offset=${offset} ${reason}`);
      for (const item of chunk) {
        result.errors.push({ id: item.sku_id, reason });
      }
      continue;
    }

    catalogLastUploadMs.set(params.catalogId, Date.now());

    if (payload.data?.feed_log_id != null && !result.feedLogId) {
      result.feedLogId = String(payload.data.feed_log_id);
    }

    const failedIds = new Set([
      ...(payload.data?.failed_sku_ids ?? []),
      ...(payload.data?.failed_item_ids ?? []),
    ]);
    if (failedIds.size > 0) {
      console.warn(
        `${LOG_PREFIX} step=product_upload_immediate_rejects offset=${offset} ids=${[...failedIds].join(",")}`,
      );
    }
    for (const item of chunk) {
      if (failedIds.has(item.sku_id)) {
        result.errors.push({ id: item.sku_id, reason: "rejected by TikTok Catalog API" });
      } else {
        result.totalProcessed += 1;
      }
    }
  }

  console.info(
    `${LOG_PREFIX} step=product_upload_done requested=${result.totalRequested} accepted=${result.totalProcessed} errors=${result.errors.length} feedLogId=${result.feedLogId ?? ""}`,
  );
  return result;
}
