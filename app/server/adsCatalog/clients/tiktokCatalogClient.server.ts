import type { TiktokCatalogItem } from "../mappers/shopifyToTiktok";
import {
  isShopifyOfficialCatalog,
  listAuthorizedAdvertiserIds,
} from "../tiktokOAuth.server";

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
  /** catalog/get 若返回关联广告主，用于绑定诊断。 */
  linkedAdvertiserIds?: string[];
}

function parseLinkedAdvertiserIds(row: Record<string, unknown>): string[] {
  const conf = (row.catalog_conf as Record<string, unknown> | undefined) ?? {};
  const candidates: unknown[] = [
    row.advertiser_ids,
    row.adv_ids,
    row.linked_advertiser_ids,
    row.advertiser_id,
    row.adv_id,
    conf.advertiser_ids,
    conf.adv_ids,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const ids = candidate.map((id) => String(id ?? "").trim()).filter(Boolean);
      if (ids.length > 0) return ids;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return [candidate.trim()];
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return [String(candidate)];
    }
  }
  return [];
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

  const linkedAdvertiserIds = parseLinkedAdvertiserIds(row);
  return {
    catalogId: params.catalogId,
    catalogName,
    catalogType,
    currency,
    regionCode,
    channel,
    businessPlatform,
    linkedAdvertiserIds: linkedAdvertiserIds.length > 0 ? linkedAdvertiserIds : undefined,
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

import { isTiktokCatalogApiSyncable } from "../../../lib/tiktokCatalogSyncability";

/** catalog/get 必须明确返回 channel=CLIENT；缺失 channel 视为不可 API 写入（常见于后台手动建库）。 */
export function isApiWritableTiktokCatalog(conf: {
  channel?: string;
  isShopifyOfficial: boolean;
}): boolean {
  return isTiktokCatalogApiSyncable({
    channel: conf.channel,
    isShopifyOfficial: conf.isShopifyOfficial,
  });
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

import {
  isTiktokCatalogAutoCreateRegion,
  TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES,
} from "../../../lib/tiktokCatalogRegions";

/** Spark 可通过 API 自动创建 Catalog 的目标市场。 */
export const TIKTOK_CATALOG_AUTO_CREATE_REGIONS = new Set(
  TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES,
);

/** @deprecated 使用 TIKTOK_CATALOG_AUTO_CREATE_REGIONS；保留别名避免旧引用断裂。 */
export const TIKTOK_CATALOG_SUPPORTED_REGIONS = TIKTOK_CATALOG_AUTO_CREATE_REGIONS;

export function formatUnsupportedTiktokCatalogRegionError(regionCode: string): string {
  const region = regionCode.trim().toUpperCase() || "UNKNOWN";
  return (
    `TikTok 不支持以国家/地区 ${region} 自动创建商品库（Invalid or unsupported country）。` +
    `请在下方「目标市场」手动选择实际销售国家（如 US、GB、DE），或在 TikTok 广告后台手动创建商品库后在 Spark「凭证」页绑定。` +
    `当前 Spark 根据店铺推断区域：${region}。`
  );
}

export function assertTiktokCatalogAutoCreateRegion(regionCode: string): void {
  const region = regionCode.trim().toUpperCase();
  if (!region || isTiktokCatalogAutoCreateRegion(region)) return;
  throw new Error(formatUnsupportedTiktokCatalogRegionError(region));
}

/** @deprecated 使用 assertTiktokCatalogAutoCreateRegion */
export function assertTiktokCatalogRegionSupported(regionCode: string): void {
  assertTiktokCatalogAutoCreateRegion(regionCode);
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

const REGION_DEFAULT_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  PT: "EUR",
  FI: "EUR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  PH: "PHP",
  ID: "IDR",
  VN: "VND",
  JP: "JPY",
  KR: "KRW",
  MX: "MXN",
  BR: "BRL",
  SA: "SAR",
  AE: "AED",
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

/**
 * 解析 Catalog 创建目标市场：优先使用用户手动选择的 override，否则按店铺推断；
 * 推断结果不可自动创建时抛错，提示用户手动选择。
 */
export function resolveTiktokCatalogTargetRegion(params: {
  currencyCode?: string;
  countryCode?: string;
  overrideRegionCode?: string;
}): {
  currency: string;
  regionCode: string;
  inferredRegionCode: string;
} {
  const inferred = resolveTiktokCatalogRegion(params.currencyCode, params.countryCode);
  const override = params.overrideRegionCode?.trim().toUpperCase() ?? "";
  if (override) {
    assertTiktokCatalogAutoCreateRegion(override);
    return {
      currency: REGION_DEFAULT_CURRENCY[override] ?? inferred.currency,
      regionCode: override,
      inferredRegionCode: inferred.regionCode,
    };
  }
  if (!isTiktokCatalogAutoCreateRegion(inferred.regionCode)) {
    throw new Error(formatUnsupportedTiktokCatalogRegionError(inferred.regionCode));
  }
  return {
    currency: inferred.currency,
    regionCode: inferred.regionCode,
    inferredRegionCode: inferred.regionCode,
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

export interface CreateTiktokPixelResult {
  pixelCode: string;
  pixelName: string;
}

export interface TiktokEventSourceBinding {
  pixelCode?: string;
  appId?: string;
  boundAt?: string;
}

export type TiktokBcPixelLinkGetErrorCode =
  | "PIXEL_ASSET_PERMISSION_DENIED"
  | "PIXEL_LINK_GET_FAILED";

export type TiktokBcPixelLinkGetResult = {
  ok: boolean;
  advertiserIds: string[];
  errorCode?: TiktokBcPixelLinkGetErrorCode;
  message?: string;
};

/** 去重并去掉空字符串的广告主 ID 列表。 */
export function uniqueAdvertiserIds(
  ...groups: Array<ReadonlyArray<string> | string | undefined | null>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    const items = Array.isArray(group) ? group : group ? [group] : [];
    for (const id of items) {
      const trimmed = String(id ?? "").trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * 选择 eventsource/bind 使用的广告主：优先 Catalog 已关联且在授权列表内的 ID。
 */
export function resolveTiktokPixelBindAdvertiserId(params: {
  credentialAdvertiserId: string;
  authorizedAdvertiserIds: string[];
  catalogLinkedAdvertiserIds?: string[];
}): string {
  const credentialId = params.credentialAdvertiserId.trim();
  const authorized = uniqueAdvertiserIds(params.authorizedAdvertiserIds);
  const catalogLinked = uniqueAdvertiserIds(params.catalogLinkedAdvertiserIds);
  if (authorized.length > 0) {
    const preferred = catalogLinked.find((id) => authorized.includes(id));
    if (preferred) return preferred;
    if (credentialId && authorized.includes(credentialId)) return credentialId;
    return authorized[0]!;
  }
  return (
    catalogLinked.find((id) => id === credentialId) ||
    catalogLinked[0] ||
    credentialId
  );
}

/**
 * 为广告主创建一个 TikTok Pixel（Web 事件追踪）。
 * POST /open_api/v1.3/pixel/create/
 */
export async function createTiktokPixel(params: {
  accessToken: string;
  advertiserId: string;
  pixelName: string;
}): Promise<CreateTiktokPixelResult> {
  const name = params.pixelName.trim() || "Spark Pixel";
  console.info(
    `${LOG_PREFIX} step=pixel_create_request advertiserId=${params.advertiserId} name=${JSON.stringify(name)}`,
  );

  const response = await fetch(`${TIKTOK_API_BASE}/pixel/create/`, {
    method: "POST",
    headers: {
      "Access-Token": params.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      advertiser_id: params.advertiserId,
      pixel_category: "ONLINE_STORE",
      pixel_name: name,
    }),
  });

  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: { pixel_code?: string };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=pixel_create_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} pixel_code=${payload.data?.pixel_code ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok Pixel create failed: HTTP ${response.status} ${detail}`.trim());
  }

  const pixelCode = String(payload.data?.pixel_code ?? "").trim();
  if (!pixelCode) {
    throw new Error("TikTok Pixel create returned no pixel_code");
  }

  console.info(
    `${LOG_PREFIX} step=pixel_create_ok pixelCode=${pixelCode} name=${JSON.stringify(name)}`,
  );
  return { pixelCode, pixelName: name };
}

type TiktokApiPayload = { code?: number; message?: string };

async function postTiktokJsonApi(params: {
  path: string;
  accessToken: string;
  body: Record<string, unknown>;
  logStep: string;
}): Promise<{ httpStatus: number; payload: TiktokApiPayload; raw: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}${params.path}`, {
    method: "POST",
    headers: {
      "Access-Token": params.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  });

  const raw = await response.text();
  let payload: TiktokApiPayload = {};
  try {
    payload = raw ? (JSON.parse(raw) as TiktokApiPayload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=${params.logStep} http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} body=${rawForLog(raw)}`,
  );

  return { httpStatus: response.status, payload, raw };
}

function isTiktokApiSuccess(httpStatus: number, payload: TiktokApiPayload): boolean {
  return httpStatus >= 200 && httpStatus < 300 && (payload.code === undefined || payload.code === 0);
}

/**
 * 将 Pixel 从广告账户转入 Business Center，以便 Catalog 事件源绑定可用。
 * POST /open_api/v1.3/bc/pixel/transfer/
 */
export async function transferTiktokPixelToBc(params: {
  accessToken: string;
  bcId: string;
  pixelCode: string;
}): Promise<void> {
  const { httpStatus, payload, raw } = await postTiktokJsonApi({
    path: "/bc/pixel/transfer/",
    accessToken: params.accessToken,
    body: {
      bc_id: params.bcId,
      pixel_code: params.pixelCode,
    },
    logStep: "pixel_transfer_request",
  });

  if (isTiktokApiSuccess(httpStatus, payload)) return;

  const detail =
    payload.message ||
    (payload.code !== undefined ? `code=${payload.code}` : "") ||
    raw.slice(0, 200) ||
    String(httpStatus);
  throw new Error(`TikTok Pixel transfer to BC failed: HTTP ${httpStatus} ${detail}`.trim());
}

/**
 * 在 BC 内将 Pixel 关联到一个或多个广告账户。
 * POST /open_api/v1.3/bc/pixel/link/update/
 */
export async function linkTiktokBcPixelToAdvertiser(params: {
  accessToken: string;
  bcId: string;
  pixelCode: string;
  advertiserIds: string[];
}): Promise<void> {
  const advertiserIds = uniqueAdvertiserIds(params.advertiserIds);
  if (advertiserIds.length === 0) {
    throw new Error("TikTok Pixel link to advertiser failed: no advertiserIds");
  }

  const { httpStatus, payload, raw } = await postTiktokJsonApi({
    path: "/bc/pixel/link/update/",
    accessToken: params.accessToken,
    body: {
      bc_id: params.bcId,
      pixel_code: params.pixelCode,
      advertiser_ids: advertiserIds,
      relation_status: "LINK",
    },
    logStep: "pixel_link_request",
  });

  if (isTiktokApiSuccess(httpStatus, payload)) return;

  const detail =
    payload.message ||
    (payload.code !== undefined ? `code=${payload.code}` : "") ||
    raw.slice(0, 200) ||
    String(httpStatus);
  throw new Error(`TikTok Pixel link to advertiser failed: HTTP ${httpStatus} ${detail}`.trim());
}

function classifyTiktokPixelLinkGetFailure(params: {
  httpStatus: number;
  code?: number;
  message?: string;
}): Pick<TiktokBcPixelLinkGetResult, "errorCode" | "message"> {
  const message = (params.message || `HTTP ${params.httpStatus}`).trim();
  const permissionDenied =
    params.code === 40002 ||
    /permission to the asset/i.test(message) ||
    /don'?t have permission/i.test(message);
  return {
    errorCode: permissionDenied
      ? "PIXEL_ASSET_PERMISSION_DENIED"
      : "PIXEL_LINK_GET_FAILED",
    message,
  };
}

/**
 * 查询 Pixel 在 BC 内已关联的广告主 ID 列表（只读，用于绑定诊断与 link 校验）。
 * GET /open_api/v1.3/bc/pixel/link/get/
 */
export async function getTiktokBcPixelLinkedAdvertiserIds(params: {
  accessToken: string;
  bcId: string;
  pixelCode: string;
}): Promise<TiktokBcPixelLinkGetResult> {
  const url = new URL(`${TIKTOK_API_BASE}/bc/pixel/link/get/`);
  url.searchParams.set("bc_id", params.bcId);
  url.searchParams.set("pixel_code", params.pixelCode);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");

  const response = await fetch(url.toString(), {
    headers: { "Access-Token": params.accessToken },
  });

  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: {
      list?: Array<{ advertiser_id?: string | number; relation_status?: string }>;
    };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=pixel_link_get_response bcId=${params.bcId} pixelCode=${params.pixelCode} http=${response.status} code=${payload.code ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const failure = classifyTiktokPixelLinkGetFailure({
      httpStatus: response.status,
      code: payload.code,
      message: payload.message || text.slice(0, 200),
    });
    return {
      ok: false,
      advertiserIds: [],
      errorCode: failure.errorCode,
      message: failure.message,
    };
  }

  const advertiserIds = (payload.data?.list ?? [])
    .filter((item) => {
      const status = String(item.relation_status ?? "LINK").trim().toUpperCase();
      return status === "" || status === "LINK";
    })
    .map((item) => String(item.advertiser_id ?? "").trim())
    .filter(Boolean);

  return { ok: true, advertiserIds };
}

/**
 * 绑定 Catalog 事件源前，确保 Pixel 已在 BC 内并对授权广告主可用。
 * transfer 可 soft-skip（已在 BC）；link/update 硬失败。
 * link/get 仅作校验：写入成功后若因资产读权限 40002 失败则 soft-skip，
 * 避免 TikTok「可写不可读」拦截后续 eventsource/bind。
 */
export async function prepareTiktokPixelForCatalogBind(params: {
  accessToken: string;
  bcId: string;
  pixelCode: string;
  advertiserId: string;
  /** 额外需要 link 的广告主（如 Catalog 已关联广告主）。 */
  extraAdvertiserIds?: string[];
}): Promise<string[]> {
  let authorized: string[] = [];
  try {
    authorized = await listAuthorizedAdvertiserIds({
      accessToken: params.accessToken,
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=pixel_list_authorized_failed err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const linkTargets = uniqueAdvertiserIds(
    authorized,
    params.advertiserId,
    params.extraAdvertiserIds,
  );
  if (linkTargets.length === 0) {
    throw new Error("TikTok Pixel prepare failed: no advertiser IDs to link");
  }

  try {
    await transferTiktokPixelToBc({
      accessToken: params.accessToken,
      bcId: params.bcId,
      pixelCode: params.pixelCode,
    });
    console.info(
      `${LOG_PREFIX} step=pixel_transfer_ok bcId=${params.bcId} pixelCode=${params.pixelCode}`,
    );
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=pixel_transfer_skipped bcId=${params.bcId} pixelCode=${params.pixelCode} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await linkTiktokBcPixelToAdvertiser({
    accessToken: params.accessToken,
    bcId: params.bcId,
    pixelCode: params.pixelCode,
    advertiserIds: linkTargets,
  });
  console.info(
    `${LOG_PREFIX} step=pixel_link_ok bcId=${params.bcId} pixelCode=${params.pixelCode} advertiserIds=${linkTargets.join(",")}`,
  );

  const linked = await getTiktokBcPixelLinkedAdvertiserIds({
    accessToken: params.accessToken,
    bcId: params.bcId,
    pixelCode: params.pixelCode,
  });
  if (!linked.ok) {
    const code = linked.errorCode ?? "PIXEL_LINK_GET_FAILED";
    // link/update 已成功时，资产读权限不足不应阻断事件源绑定。
    if (code === "PIXEL_ASSET_PERMISSION_DENIED") {
      console.warn(
        `${LOG_PREFIX} step=pixel_link_get_skipped bcId=${params.bcId} pixelCode=${params.pixelCode} code=${code} message=${linked.message ?? ""}`,
      );
      return linkTargets;
    }
    throw new Error(
      `TikTok Pixel link/get failed after link: ${linked.message ?? "unknown"} [${code}]`,
    );
  }

  const hit = linkTargets.some((id) => linked.advertiserIds.includes(id));
  if (!hit) {
    throw new Error(
      `TikTok Pixel link verification failed: expected one of [${linkTargets.join(",")}] but linked=[${linked.advertiserIds.join(",") || "none"}]`,
    );
  }

  return linkTargets;
}

/** 从 TikTok 事件源绑定错误文案中提取稳定 errorCode，供前端 i18n 映射。 */
export function getTiktokEventSourceBindErrorCode(message: string): string | undefined {
  if (
    message.includes("PIXEL_ASSET_PERMISSION_DENIED") ||
    message.includes("40002") ||
    /permission to the asset/i.test(message)
  ) {
    return "PIXEL_ASSET_PERMISSION_DENIED";
  }
  if (
    message.includes("1000018") ||
    message.includes("ERRCODE_EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV")
  ) {
    return "EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV";
  }
  return undefined;
}

/**
 * 准备 Pixel（转入 BC + 关联全部授权广告主）后绑定为 Catalog Web 事件源。
 * 返回实际用于 eventsource/bind 的 advertiserId，供调用方回写凭证。
 */
export async function bindTiktokCatalogPixelEventSource(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  pixelCode: string;
}): Promise<{ advertiserId: string }> {
  const conf = await fetchTiktokCatalogConf({
    accessToken: params.accessToken,
    bcId: params.bcId,
    catalogId: params.catalogId,
  });
  const catalogLinkedAdvertiserIds = conf?.linkedAdvertiserIds ?? [];

  let authorizedAdvertiserIds: string[] = [];
  try {
    authorizedAdvertiserIds = await listAuthorizedAdvertiserIds({
      accessToken: params.accessToken,
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=eventsource_list_authorized_failed err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const bindAdvertiserId = resolveTiktokPixelBindAdvertiserId({
    credentialAdvertiserId: params.advertiserId,
    authorizedAdvertiserIds,
    catalogLinkedAdvertiserIds,
  });

  await prepareTiktokPixelForCatalogBind({
    accessToken: params.accessToken,
    bcId: params.bcId,
    pixelCode: params.pixelCode,
    advertiserId: bindAdvertiserId,
    extraAdvertiserIds: uniqueAdvertiserIds(
      authorizedAdvertiserIds,
      params.advertiserId,
      catalogLinkedAdvertiserIds,
    ),
  });
  await bindTiktokCatalogEventSource({
    accessToken: params.accessToken,
    advertiserId: bindAdvertiserId,
    bcId: params.bcId,
    catalogId: params.catalogId,
    pixelCode: params.pixelCode,
  });
  return { advertiserId: bindAdvertiserId };
}

/**
 * 将 Pixel 或 App 作为事件源绑定到 Catalog。
 * POST /open_api/v1.3/catalog/eventsource/bind/
 * pixel_code 和 app_id 至少提供一个。
 */
export async function bindTiktokCatalogEventSource(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  pixelCode?: string;
  appId?: string;
}): Promise<void> {
  if (!params.pixelCode && !params.appId) {
    throw new Error("bindTiktokCatalogEventSource: 必须提供 pixelCode 或 appId 中至少一个");
  }

  console.info(
    `${LOG_PREFIX} step=eventsource_bind_request advertiserId=${params.advertiserId} bcId=${params.bcId} catalogId=${params.catalogId} pixelCode=${params.pixelCode ?? ""} appId=${params.appId ?? ""}`,
  );

  const body: Record<string, string> = {
    advertiser_id: params.advertiserId,
    bc_id: params.bcId,
    catalog_id: params.catalogId,
  };
  if (params.pixelCode) body.pixel_code = params.pixelCode;
  if (params.appId) body.app_id = params.appId;

  const response = await fetch(`${TIKTOK_API_BASE}/catalog/eventsource/bind/`, {
    method: "POST",
    headers: {
      "Access-Token": params.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: { code?: number; message?: string } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=eventsource_bind_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(
      `TikTok Catalog event source bind failed: HTTP ${response.status} ${detail}`.trim(),
    );
  }
}

/**
 * 获取 Catalog 当前绑定的事件源列表。
 * GET /open_api/v1.3/catalog/eventsource_bind/get/
 */
export async function getTiktokCatalogEventSourceBindings(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
}): Promise<TiktokEventSourceBinding[]> {
  const url = new URL(`${TIKTOK_API_BASE}/catalog/eventsource_bind/get/`);
  url.searchParams.set("bc_id", params.bcId);
  url.searchParams.set("catalog_id", params.catalogId);

  const response = await fetch(url.toString(), {
    headers: { "Access-Token": params.accessToken },
  });

  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: {
      list?: Array<{
        pixel_code?: string;
        app_id?: string;
        create_time?: string;
      }>;
    };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    console.warn(
      `${LOG_PREFIX} step=eventsource_bind_get_failed http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""}`,
    );
    return [];
  }

  return (payload.data?.list ?? []).map((item) => ({
    pixelCode: item.pixel_code || undefined,
    appId: item.app_id || undefined,
    boundAt: item.create_time || undefined,
  }));
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
  const resolved = resolveTiktokCatalogTargetRegion({
    currencyCode: params.currency,
    countryCode: params.countryCode,
    overrideRegionCode: params.regionCode,
  });
  const region = resolved.regionCode;
  const currency = resolved.currency;
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
    if (/unsupported country/i.test(detail)) {
      throw new Error(formatUnsupportedTiktokCatalogRegionError(region));
    }
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

export interface TiktokProductFileUploadResult {
  feedLogId?: string;
  requestId?: string;
}

/**
 * 通过公网文件 URL 上传 Catalog 商品（一次性 Feed 文件）。
 * POST /open_api/v1.3/catalog/product/file/
 */
export async function uploadTiktokCatalogProductFile(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
  fileUrl: string;
  updateMode?: "INCREMENTAL" | "REPLACE";
}): Promise<TiktokProductFileUploadResult> {
  const updateMode = params.updateMode ?? "INCREMENTAL";
  const url = `${TIKTOK_API_BASE}/catalog/product/file/`;
  const requestBody = {
    bc_id: params.bcId,
    catalog_id: params.catalogId,
    file_url: params.fileUrl,
    update_mode: updateMode,
  };

  console.info(
    `${LOG_PREFIX} step=product_file_request bcId=${params.bcId} catalogId=${params.catalogId} updateMode=${updateMode} fileUrl=${params.fileUrl.slice(0, 240)}`,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Access-Token": params.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    const reason = `network error: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`${LOG_PREFIX} step=product_file_network_error ${reason}`);
    throw new Error(`TikTok Catalog product/file failed: ${reason}`);
  }

  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    request_id?: string;
    data?: { feed_log_id?: string | number };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=product_file_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} request_id=${payload.request_id ?? ""} feed_log_id=${payload.data?.feed_log_id ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const apiPart =
      payload.code !== undefined
        ? `code=${payload.code}${payload.message ? ` ${payload.message}` : ""}`
        : payload.message || text.slice(0, 200) || response.statusText;
    throw new Error(
      `TikTok Catalog product/file failed: HTTP ${response.status}${apiPart ? ` ${apiPart}` : ""}`,
    );
  }

  const feedLogId =
    payload.data?.feed_log_id != null ? String(payload.data.feed_log_id).trim() : undefined;

  return {
    ...(feedLogId ? { feedLogId } : {}),
    ...(payload.request_id ? { requestId: payload.request_id } : {}),
  };
}

export type TiktokPixelListItem = {
  pixelCode: string;
  pixelName: string;
  pixelId?: string;
};

/**
 * 列出广告主下的 Pixel。
 * GET /open_api/v1.3/pixel/list/
 */
/** TikTok `pixel/list` 要求 page_size ≤ 20。 */
const TIKTOK_PIXEL_LIST_MAX_PAGE_SIZE = 20;

export async function listTiktokPixels(params: {
  accessToken: string;
  advertiserId: string;
  page?: number;
  pageSize?: number;
}): Promise<TiktokPixelListItem[]> {
  const pageSize = Math.min(
    Math.max(1, params.pageSize ?? TIKTOK_PIXEL_LIST_MAX_PAGE_SIZE),
    TIKTOK_PIXEL_LIST_MAX_PAGE_SIZE,
  );
  const url = new URL(`${TIKTOK_API_BASE}/pixel/list/`);
  url.searchParams.set("advertiser_id", params.advertiserId);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("order_by", "LATEST_CREATE");

  console.info(
    `${LOG_PREFIX} step=pixel_list_request advertiserId=${params.advertiserId}`,
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: {
      pixels?: Array<{
        pixel_id?: string | number;
        pixel_code?: string;
        pixel_name?: string;
        name?: string;
      }>;
      list?: Array<{
        pixel_id?: string | number;
        pixel_code?: string;
        pixel_name?: string;
        name?: string;
      }>;
    };
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=pixel_list_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok Pixel list failed: HTTP ${response.status} ${detail}`.trim());
  }

  const rows = payload.data?.pixels ?? payload.data?.list ?? [];
  const out: TiktokPixelListItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pixelCode = String(row.pixel_code ?? "").trim();
    if (!pixelCode || seen.has(pixelCode)) continue;
    seen.add(pixelCode);
    out.push({
      pixelCode,
      pixelName: String(row.pixel_name ?? row.name ?? pixelCode).trim() || pixelCode,
      pixelId:
        row.pixel_id != null && String(row.pixel_id).trim()
          ? String(row.pixel_id).trim()
          : undefined,
    });
  }
  return out;
}

export type TrackTiktokPixelEventParams = {
  /** Events Manager 生成的 Events API Access Token。 */
  eventsApiAccessToken: string;
  pixelCode: string;
  event: string;
  eventId?: string;
  timestamp?: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  testEventCode?: string;
};

/**
 * 通过 Events API 上报单条 Pixel 事件。
 * POST /open_api/v1.3/pixel/track/
 */
export async function trackTiktokPixelEvent(
  params: TrackTiktokPixelEventParams,
): Promise<void> {
  const pixelCode = params.pixelCode.trim();
  const event = params.event.trim();
  const token = params.eventsApiAccessToken.trim();
  if (!pixelCode || !event || !token) {
    throw new Error("TikTok pixel track requires pixelCode, event, and eventsApiAccessToken");
  }

  const body: Record<string, unknown> = {
    pixel_code: pixelCode,
    event,
  };
  if (params.eventId?.trim()) body.event_id = params.eventId.trim();
  if (params.timestamp?.trim()) body.timestamp = params.timestamp.trim();
  if (params.properties && Object.keys(params.properties).length > 0) {
    body.properties = params.properties;
  }
  if (params.context && Object.keys(params.context).length > 0) {
    body.context = params.context;
  }
  if (params.testEventCode?.trim()) {
    body.test_event_code = params.testEventCode.trim();
  }

  console.info(
    `${LOG_PREFIX} step=pixel_track_request pixelCode=${pixelCode} event=${event} eventId=${params.eventId ?? ""} test=${params.testEventCode?.trim() ? "1" : "0"}`,
  );

  const response = await fetch(`${TIKTOK_API_BASE}/pixel/track/`, {
    method: "POST",
    headers: {
      "Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: { code?: number; message?: string } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=pixel_track_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok Pixel track failed: HTTP ${response.status} ${detail}`.trim());
  }
}
