import type { TiktokCatalogItem } from "../mappers/shopifyToTiktok";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const ITEMS_BATCH_CHUNK = 50;

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
    throw new Error(`TikTok Catalog create failed: HTTP ${response.status} ${detail}`.trim());
  }

  const catalogId = String(payload.data?.catalog_id ?? "").trim();
  if (!catalogId) {
    throw new Error("TikTok Catalog create returned no catalog_id");
  }
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

  for (let offset = 0; offset < params.items.length; offset += ITEMS_BATCH_CHUNK) {
    const chunk = params.items.slice(offset, offset + ITEMS_BATCH_CHUNK);

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

    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      const apiPart =
        payload.code !== undefined
          ? `code=${payload.code}${payload.message ? ` ${payload.message}` : ""}`
          : payload.message || text.slice(0, 200) || response.statusText;
      const reason = `TikTok Catalog upload failed: HTTP ${response.status}${apiPart ? ` ${apiPart}` : ""}`;
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
    for (const item of chunk) {
      if (failedIds.has(item.sku_id)) {
        result.errors.push({ id: item.sku_id, reason: "rejected by TikTok Catalog API" });
      } else {
        result.totalProcessed += 1;
      }
    }
  }

  return result;
}
