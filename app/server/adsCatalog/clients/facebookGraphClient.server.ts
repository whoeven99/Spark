import type { FacebookCatalogItem } from "../mappers/shopifyToFacebook";

const DEFAULT_API_VERSION = "v19.0";
const FB_GRAPH_BASE = "https://graph.facebook.com";
const ITEMS_BATCH_CHUNK = 50;

export interface FacebookBatchResult {
  totalRequested: number;
  totalProcessed: number;
  errors: Array<{ id: string; reason: string }>;
  handles: string[];
}

interface ItemsBatchRequest {
  method: "CREATE" | "UPDATE" | "DELETE";
  data: FacebookCatalogItem;
}

/**
 * Push a batch of catalog items to Facebook Marketing API
 * (catalog batch upsert).
 *
 * Endpoint:
 *   POST {graph}/{api}/{catalogId}/items_batch
 *   body: { allow_upsert: true, requests: [{method, data}, ...] }
 */
export async function upsertFacebookCatalogItems(params: {
  accessToken: string;
  catalogId: string;
  items: FacebookCatalogItem[];
  apiVersion?: string;
}): Promise<FacebookBatchResult> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const result: FacebookBatchResult = {
    totalRequested: params.items.length,
    totalProcessed: 0,
    errors: [],
    handles: [],
  };

  for (let offset = 0; offset < params.items.length; offset += ITEMS_BATCH_CHUNK) {
    const chunk = params.items.slice(offset, offset + ITEMS_BATCH_CHUNK);
    const requests: ItemsBatchRequest[] = chunk.map((item) => ({
      method: "UPDATE",
      data: item,
    }));

    const url = `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(
      params.catalogId,
    )}/items_batch`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: params.accessToken,
          allow_upsert: true,
          item_type: "PRODUCT_ITEM",
          requests,
        }),
      });
    } catch (e) {
      for (const item of chunk) {
        result.errors.push({
          id: item.id,
          reason: `network error: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      continue;
    }

    const text = await response.text();
    let payload: { handles?: string[]; error?: { message?: string } } = {};
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const reason =
        payload.error?.message || `HTTP ${response.status} ${text.slice(0, 200)}`;
      for (const item of chunk) {
        result.errors.push({ id: item.id, reason });
      }
      continue;
    }

    if (Array.isArray(payload.handles)) {
      result.handles.push(...payload.handles);
    }
    result.totalProcessed += chunk.length;
  }

  return result;
}

/**
 * Lightweight credential probe — verifies the access token can read the
 * catalog metadata (used during the credential setup flow).
 */
export async function verifyFacebookCatalogCredential(params: {
  accessToken: string;
  catalogId: string;
  apiVersion?: string;
}): Promise<{ ok: true; name?: string } | { ok: false; reason: string }> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const url = `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(
    params.catalogId,
  )}?fields=name,product_count&access_token=${encodeURIComponent(params.accessToken)}`;

  try {
    const response = await fetch(url);
    const json = (await response.json().catch(() => ({}))) as {
      name?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, reason: json.error?.message || `HTTP ${response.status}` };
    }
    return { ok: true, name: json.name };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

export type MetaPixelListItem = {
  pixelId: string;
  pixelName: string;
};

async function fetchMetaPixelGraphPages(params: {
  initialUrl: string;
  maxPages?: number;
}): Promise<Array<{ id?: string; name?: string }>> {
  const out: Array<{ id?: string; name?: string }> = [];
  let nextUrl: string | null = params.initialUrl;
  let pages = 0;
  const maxPages = params.maxPages ?? 10;

  while (nextUrl && pages < maxPages) {
    pages += 1;
    const response = await fetch(nextUrl);
    const json = (await response.json().catch(() => ({}))) as {
      data?: Array<{ id?: string; name?: string }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    out.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }
  return out;
}

function normalizeMetaPixelRows(rows: Array<{ id?: string; name?: string }>): MetaPixelListItem[] {
  const out: MetaPixelListItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pixelId = String(row.id ?? "").trim();
    if (!pixelId || seen.has(pixelId)) continue;
    seen.add(pixelId);
    const pixelName = String(row.name ?? pixelId).trim() || pixelId;
    out.push({ pixelId, pixelName });
  }
  return out;
}

/**
 * 列举广告账户下的 Meta Pixel。
 * GET /{ad-account-id}/adspixels
 */
export async function listMetaAdAccountPixels(params: {
  accessToken: string;
  adAccountId: string;
  apiVersion?: string;
}): Promise<MetaPixelListItem[]> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const adAccountId = params.adAccountId.trim();
  const accessToken = params.accessToken.trim();
  if (!adAccountId || !accessToken) {
    throw new Error("adAccountId and accessToken are required");
  }

  const url = new URL(
    `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(adAccountId)}/adspixels`,
  );
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const rows = await fetchMetaPixelGraphPages({ initialUrl: url.toString() });
  return normalizeMetaPixelRows(rows);
}

/**
 * 列举 Business 拥有的 Meta Pixel。
 * GET /{business-id}/owned_pixels
 */
export async function listMetaBusinessPixels(params: {
  accessToken: string;
  businessId: string;
  apiVersion?: string;
}): Promise<MetaPixelListItem[]> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const businessId = params.businessId.trim();
  const accessToken = params.accessToken.trim();
  if (!businessId || !accessToken) {
    throw new Error("businessId and accessToken are required");
  }

  const url = new URL(
    `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(businessId)}/owned_pixels`,
  );
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const rows = await fetchMetaPixelGraphPages({ initialUrl: url.toString() });
  return normalizeMetaPixelRows(rows);
}

export type MetaAdsPixelMetadata = {
  pixelId: string;
  name: string;
  lastFiredTime: string | null;
  isUnavailable: boolean | null;
  eventTimeMin: number | null;
  eventTimeMax: number | null;
  creationTime: string | null;
};

export type MetaAdsPixelStatsAggregation =
  | "event_total_counts"
  | "event"
  | "pixel_fire"
  | "browser_type"
  | "device_os"
  | "device_type";

export type MetaAdsPixelStatsRow = {
  value: string;
  count: number;
};

export type MetaAdsPixelStatsBucket = {
  startTime: string;
  aggregation: string;
  count: number | null;
  rows: MetaAdsPixelStatsRow[];
};

function parseMetaPixelStatsBuckets(payload: unknown): MetaAdsPixelStatsBucket[] {
  const root = payload as { data?: unknown[] };
  if (!Array.isArray(root.data)) return [];

  const out: MetaAdsPixelStatsBucket[] = [];
  for (const item of root.data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const startTime = String(record.start_time ?? "").trim();
    const aggregation = String(record.aggregation ?? "").trim();
    const countRaw = record.count;
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw) ? countRaw : null;
    const rows: MetaAdsPixelStatsRow[] = [];
    const nested = record.data;
    if (Array.isArray(nested)) {
      for (const row of nested) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const value = String(r.value ?? "").trim();
        const rowCount = typeof r.count === "number" && Number.isFinite(r.count) ? r.count : 0;
        if (!value) continue;
        rows.push({ value, count: rowCount });
      }
    }
    out.push({
      startTime,
      aggregation,
      count,
      rows,
    });
  }
  return out;
}

/**
 * 读取 Meta Ads Pixel 元数据。
 * GET /{ads-pixel-id}?fields=...
 */
export async function getMetaAdsPixelMetadata(params: {
  accessToken: string;
  pixelId: string;
  apiVersion?: string;
}): Promise<MetaAdsPixelMetadata> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const pixelId = params.pixelId.trim();
  const accessToken = params.accessToken.trim();
  if (!pixelId || !accessToken) {
    throw new Error("pixelId and accessToken are required");
  }

  const url = new URL(
    `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(pixelId)}`,
  );
  url.searchParams.set(
    "fields",
    "id,name,last_fired_time,is_unavailable,event_time_min,event_time_max,creation_time",
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const json = (await response.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    last_fired_time?: string;
    is_unavailable?: boolean;
    event_time_min?: number;
    event_time_max?: number;
    creation_time?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message || `HTTP ${response.status}`);
  }

  return {
    pixelId: String(json.id ?? pixelId).trim() || pixelId,
    name: String(json.name ?? pixelId).trim() || pixelId,
    lastFiredTime: json.last_fired_time?.trim() || null,
    isUnavailable: typeof json.is_unavailable === "boolean" ? json.is_unavailable : null,
    eventTimeMin:
      typeof json.event_time_min === "number" && Number.isFinite(json.event_time_min)
        ? json.event_time_min
        : null,
    eventTimeMax:
      typeof json.event_time_max === "number" && Number.isFinite(json.event_time_max)
        ? json.event_time_max
        : null,
    creationTime: json.creation_time?.trim() || null,
  };
}

/**
 * 读取 Meta Ads Pixel stats。
 * GET /{ads-pixel-id}/stats
 */
export async function getMetaAdsPixelStats(params: {
  accessToken: string;
  pixelId: string;
  aggregation: MetaAdsPixelStatsAggregation;
  startTime?: number;
  endTime?: number;
  eventSource?: "WEB_ONLY" | "SERVER_ONLY";
  apiVersion?: string;
}): Promise<MetaAdsPixelStatsBucket[]> {
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const pixelId = params.pixelId.trim();
  const accessToken = params.accessToken.trim();
  if (!pixelId || !accessToken) {
    throw new Error("pixelId and accessToken are required");
  }

  const url = new URL(
    `${FB_GRAPH_BASE}/${apiVersion}/${encodeURIComponent(pixelId)}/stats`,
  );
  url.searchParams.set("aggregation", params.aggregation);
  url.searchParams.set("access_token", accessToken);
  if (typeof params.startTime === "number" && params.startTime > 0) {
    url.searchParams.set("start_time", String(params.startTime));
  }
  if (typeof params.endTime === "number" && params.endTime > 0) {
    url.searchParams.set("end_time", String(params.endTime));
  }
  if (params.eventSource) {
    url.searchParams.set("event_source", params.eventSource);
  }

  const response = await fetch(url.toString());
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message || `HTTP ${response.status}`);
  }
  return parseMetaPixelStatsBuckets(json);
}
