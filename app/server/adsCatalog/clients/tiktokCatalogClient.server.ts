import type { TiktokCatalogItem } from "../mappers/shopifyToTiktok";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const ITEMS_BATCH_CHUNK = 50;

export interface TiktokBatchResult {
  totalRequested: number;
  totalProcessed: number;
  errors: Array<{ id: string; reason: string }>;
}

/**
 * Push a batch of catalog items to TikTok for Business Catalog API
 * (batch create or update).
 *
 * Endpoint:
 *   POST /open_api/v1.3/catalog/product/batch_create_or_update/
 *   Header: Access-Token
 *   Body: { advertiser_id, catalog_id, items: [...] }
 */
export async function upsertTiktokCatalogItems(params: {
  accessToken: string;
  advertiserId: string;
  catalogId: string;
  items: TiktokCatalogItem[];
}): Promise<TiktokBatchResult> {
  const result: TiktokBatchResult = {
    totalRequested: params.items.length,
    totalProcessed: 0,
    errors: [],
  };

  const url = `${TIKTOK_API_BASE}/catalog/product/batch_create_or_update/`;

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
          advertiser_id: params.advertiserId,
          catalog_id: params.catalogId,
          items: chunk,
        }),
      });
    } catch (e) {
      const reason = `network error: ${e instanceof Error ? e.message : String(e)}`;
      for (const item of chunk) {
        result.errors.push({ id: item.item_id, reason });
      }
      continue;
    }

    const text = await response.text();
    let payload: { code?: number; message?: string; data?: { failed_item_ids?: string[] } } = {};
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    } catch {
      payload = {};
    }

    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      const reason =
        payload.message || `HTTP ${response.status} ${text.slice(0, 200)}`;
      for (const item of chunk) {
        result.errors.push({ id: item.item_id, reason });
      }
      continue;
    }

    const failedIds = new Set(payload.data?.failed_item_ids ?? []);
    for (const item of chunk) {
      if (failedIds.has(item.item_id)) {
        result.errors.push({ id: item.item_id, reason: "rejected by TikTok Catalog API" });
      } else {
        result.totalProcessed += 1;
      }
    }
  }

  return result;
}
