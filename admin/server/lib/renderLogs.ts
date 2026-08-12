/**
 * Render Logs API 薄封装（Admin 读 TSF Web 运行时日志）。
 * @see https://api-docs.render.com/reference/list-logs
 */

const RENDER_API = "https://api.render.com/v1";

export const DEFAULT_RENDER_OWNER_ID = "tea-csovfmhu0jms738qrra0";

export const TSF_WEB_RENDER_SERVICES = {
  prod: {
    key: "prod" as const,
    label: "PROD",
    serviceId: "srv-csp2931u0jms738sfmc0",
  },
  test: {
    key: "test" as const,
    label: "TEST",
    serviceId: "srv-d93cqrtaeets73dg6cn0",
  },
};

export type TsfWebRenderEnv = keyof typeof TSF_WEB_RENDER_SERVICES;

export type RenderLogEntry = {
  id?: string;
  message?: string;
  timestamp?: string;
  labels?: Array<{ name: string; value: string }>;
};

type RenderLogsResponse = {
  hasMore?: boolean;
  logs?: RenderLogEntry[];
  nextStartTime?: string;
  nextEndTime?: string;
};

export type RenderLogsCursor = {
  startTime: string;
  endTime: string;
};

export function getRenderApiKey(): string | null {
  return process.env.RENDER_API_KEY?.trim() || null;
}

export function getRenderOwnerId(): string {
  return process.env.RENDER_OWNER_ID?.trim() || DEFAULT_RENDER_OWNER_ID;
}

export function isRenderLogsConfigured(): boolean {
  return Boolean(getRenderApiKey());
}

export function resolveTsfWebServiceId(env: string): string | null {
  const key = env.trim().toLowerCase();
  if (key === "prod" || key === "production") {
    return TSF_WEB_RENDER_SERVICES.prod.serviceId;
  }
  if (key === "test") {
    return TSF_WEB_RENDER_SERVICES.test.serviceId;
  }
  return null;
}

export function encodeRenderLogsCursor(cursor: RenderLogsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeRenderLogsCursor(raw: string | undefined): RenderLogsCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), "base64url").toString("utf8"),
    ) as RenderLogsCursor;
    if (parsed?.startTime && parsed?.endTime) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function renderFetch(
  apiKey: string,
  path: string,
  query: Record<string, string | number | string[] | undefined>,
): Promise<RenderLogsResponse> {
  const url = new URL(`${RENDER_API}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const text = await res.text();
  let body: RenderLogsResponse;
  try {
    body = text ? (JSON.parse(text) as RenderLogsResponse) : {};
  } catch {
    throw new Error(`Render API 响应非 JSON（HTTP ${res.status}）`);
  }

  if (!res.ok) {
    throw new Error(
      `Render Logs API HTTP ${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
    );
  }
  return body;
}

export type FetchTsfWebLogsParams = {
  serviceId: string;
  shop: string;
  startTime: string;
  endTime: string;
  cursor?: RenderLogsCursor | null;
  maxPages?: number;
  pageLimit?: number;
};

export type FetchTsfWebLogsResult = {
  entries: RenderLogEntry[];
  hasMore: boolean;
  cursor: RenderLogsCursor | null;
};

/** 按 shop 关键字拉 TSF Web app 日志（backward 分页）。 */
export async function fetchTsfWebLogs(
  params: FetchTsfWebLogsParams,
): Promise<FetchTsfWebLogsResult> {
  const apiKey = getRenderApiKey();
  if (!apiKey) {
    throw new Error("RENDER_API_KEY 未配置");
  }

  const ownerId = getRenderOwnerId();
  const maxPages = Math.min(Math.max(params.maxPages ?? 5, 1), 10);
  const pageLimit = Math.min(Math.max(params.pageLimit ?? 100, 1), 100);

  const entries: RenderLogEntry[] = [];
  let startTime = params.cursor?.startTime ?? params.startTime;
  let endTime = params.cursor?.endTime ?? params.endTime;
  let hasMore = false;
  let nextCursor: RenderLogsCursor | null = null;

  for (let page = 0; page < maxPages; page++) {
    const data = await renderFetch(apiKey, "/logs", {
      ownerId,
      resource: params.serviceId,
      type: "app",
      direction: "backward",
      limit: pageLimit,
      startTime,
      endTime,
      text: params.shop,
    });

    const batch = data.logs ?? [];
    entries.push(...batch);

    if (data.hasMore && data.nextStartTime && data.nextEndTime) {
      hasMore = true;
      nextCursor = {
        startTime: data.nextStartTime,
        endTime: data.nextEndTime,
      };
      startTime = data.nextStartTime;
      endTime = data.nextEndTime;
      continue;
    }

    hasMore = false;
    nextCursor = null;
    break;
  }

  return { entries, hasMore, cursor: hasMore ? nextCursor : null };
}

export function parseLogTimestamp(entry: RenderLogEntry): number {
  const raw = entry.timestamp?.trim();
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}
