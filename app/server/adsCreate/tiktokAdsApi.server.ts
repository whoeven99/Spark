/**
 * TikTok Marketing API（正式环境）— 广告创建共用客户端。
 * 不包含沙盒 QPS / v1.2 降级逻辑。
 */

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

type TiktokApiPayload<T = Record<string, unknown>> = {
  code: number;
  message: string;
  data?: T;
  request_id?: string;
};

const SPARK_IDENTITY_TYPES = new Set(["TT_USER", "AUTH_CODE", "BC_AUTH_TT"]);

export type TiktokIdentity = {
  identityId: string;
  identityType: string;
  displayName: string;
  availableStatus?: string;
};

export type TiktokIdentityVideo = {
  itemId: string;
  title?: string;
};

/** TT_USER 等授权账号身份需绑定 TikTok 帖子（Spark Ad）。 */
export function isTiktokSparkIdentityType(identityType: string): boolean {
  return SPARK_IDENTITY_TYPES.has(identityType);
}

/** 从 identity/video/get 结果中取第一条可用 item_id。 */
export function extractFirstTiktokItemId(
  videoList: Array<Record<string, unknown>> | undefined,
): string | null {
  for (const row of videoList ?? []) {
    const id = row.item_id ?? row.tiktok_item_id;
    if (id !== undefined) {
      const normalized = String(id).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

/**
 * 将 datetime-local 或 ISO 字符串转为 TikTok 排期格式 `YYYY-MM-DD HH:mm:ss`。
 * 空值时返回当前 UTC 整点。
 */
export function formatTiktokScheduleTime(input?: string | null): string {
  const d = input?.trim() ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCMinutes(0, 0, 0);
    return formatUtcDateTime(fallback);
  }
  // datetime-local 无时区，按本地墙钟拼成 TikTok 期望的无偏移字符串
  if (input && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.trim())) {
    const [datePart, timePart = "00:00"] = input.trim().split("T");
    const hhmm = timePart.slice(0, 5);
    return `${datePart} ${hhmm}:00`;
  }
  return formatUtcDateTime(d);
}

function formatUtcDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** 有结束时间 → SCHEDULE_START_END，否则 SCHEDULE_FROM_NOW。 */
export function resolveScheduleType(endTime?: string | null): "SCHEDULE_FROM_NOW" | "SCHEDULE_START_END" {
  return endTime?.trim() ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW";
}

async function parseTiktokJson<T>(resp: Response): Promise<T> {
  const text = await resp.text();
  let payload: TiktokApiPayload<T>;
  try {
    payload = JSON.parse(text) as TiktokApiPayload<T>;
  } catch {
    throw new Error(`TikTok API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (payload.code !== 0) {
    throw new Error(payload.message ?? `TikTok API error code ${payload.code}`);
  }
  return payload.data as T;
}

export async function tiktokGet<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  query: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { "Access-Token": accessToken },
  });
  return parseTiktokJson<T>(resp);
}

export async function tiktokPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseTiktokJson<T>(resp);
}

export async function fetchAdvertiserCurrency(params: {
  accessToken: string;
  advertiserId: string;
}): Promise<string | null> {
  try {
    const data = await tiktokGet<{
      list?: Array<{ currency?: string; advertiser_id?: string | number }>;
    }>("/advertiser/info/", params.accessToken, {
      advertiser_ids: JSON.stringify([params.advertiserId]),
      fields: JSON.stringify(["advertiser_id", "currency"]),
    });
    const row = data?.list?.[0];
    return row?.currency?.trim() || null;
  } catch {
    return null;
  }
}

export async function listTiktokIdentities(params: {
  accessToken: string;
  advertiserId: string;
}): Promise<TiktokIdentity[]> {
  const out: TiktokIdentity[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await tiktokGet<{
      identity_list?: Array<Record<string, unknown>>;
      list?: Array<Record<string, unknown>>;
      page_info?: { total_page?: number };
    }>("/identity/get/", params.accessToken, {
      advertiser_id: params.advertiserId,
      page: String(page),
      page_size: "50",
    });
    const list = data?.identity_list ?? data?.list ?? [];
    for (const item of list) {
      const identityId = String(item.identity_id ?? "").trim();
      const identityType = String(item.identity_type ?? "").trim();
      if (!identityId || !identityType) continue;
      out.push({
        identityId,
        identityType,
        displayName: String(item.display_name ?? item.displayName ?? "").trim(),
        availableStatus:
          item.available_status !== undefined
            ? String(item.available_status)
            : undefined,
      });
    }
    const totalPage = Math.max(1, Number(data?.page_info?.total_page ?? 1));
    if (page >= totalPage || list.length === 0) break;
  }
  return out;
}

export async function listTiktokIdentityVideos(params: {
  accessToken: string;
  advertiserId: string;
  identityId: string;
  identityType: string;
}): Promise<TiktokIdentityVideo[]> {
  const data = await tiktokGet<{
    video_list?: Array<Record<string, unknown>>;
  }>("/identity/video/get/", params.accessToken, {
    advertiser_id: params.advertiserId,
    identity_id: params.identityId,
    identity_type: params.identityType,
    page: "1",
    page_size: "20",
  });
  const out: TiktokIdentityVideo[] = [];
  for (const row of data?.video_list ?? []) {
    const itemId = String(row.item_id ?? row.tiktok_item_id ?? "").trim();
    if (!itemId) continue;
    out.push({
      itemId,
      title: row.title !== undefined ? String(row.title) : undefined,
    });
  }
  return out;
}

function pickAssetId(
  data: Array<Record<string, unknown>> | Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined) {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

export async function uploadAdImageByUrl(params: {
  accessToken: string;
  advertiserId: string;
  imageUrl: string;
  fileName?: string;
}): Promise<string> {
  const data = await tiktokPost<
    Array<Record<string, unknown>> | Record<string, unknown>
  >("/file/image/ad/upload/", params.accessToken, {
    advertiser_id: params.advertiserId,
    upload_type: "UPLOAD_BY_URL",
    image_url: params.imageUrl,
    file_name: params.fileName || `spark-ad-${Date.now().toString(36)}.jpg`,
  });
  const imageId = pickAssetId(data, ["image_id", "id"]);
  if (!imageId) throw new Error("TikTok 图片上传成功但未返回 image_id");
  return imageId;
}

export async function uploadAdVideoByUrl(params: {
  accessToken: string;
  advertiserId: string;
  videoUrl: string;
  fileName?: string;
}): Promise<string> {
  const data = await tiktokPost<
    Array<Record<string, unknown>> | Record<string, unknown>
  >("/file/video/ad/upload/", params.accessToken, {
    advertiser_id: params.advertiserId,
    upload_type: "UPLOAD_BY_URL",
    video_url: params.videoUrl,
    file_name: params.fileName || `spark-ad-${Date.now().toString(36)}.mp4`,
  });
  const videoId = pickAssetId(data, ["video_id", "id"]);
  if (!videoId) throw new Error("TikTok 视频上传成功但未返回 video_id");
  return videoId;
}
