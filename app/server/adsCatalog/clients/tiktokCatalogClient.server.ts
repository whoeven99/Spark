import type { TiktokCatalogItem } from "../mappers/shopifyToTiktok";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const ITEMS_BATCH_CHUNK = 50;
const LOG_PREFIX = "[AdsCatalog][TikTokClient]";

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
  };
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

/** 由店铺币种推断 Catalog 创建所需 currency + region_code。 */
export function resolveTiktokCatalogRegion(currencyCode?: string): {
  currency: string;
  regionCode: string;
} {
  const currency = (currencyCode || "USD").trim().toUpperCase() || "USD";
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
  regionCode?: string;
}): Promise<CreateTiktokCatalogResult> {
  const { currency, regionCode } = resolveTiktokCatalogRegion(params.currency);
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

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bc_id: params.bcId,
          catalog_id: params.catalogId,
          // advertiser_id is accepted by some catalog APIs; keep for compatibility.
          advertiser_id: params.advertiserId,
          products: chunk,
        }),
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
      `${LOG_PREFIX} step=product_upload_response offset=${offset} http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} request_id=${payload.request_id ?? ""} feed_log_id=${payload.data?.feed_log_id ?? ""} body=${text.slice(0, 800)}`,
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
