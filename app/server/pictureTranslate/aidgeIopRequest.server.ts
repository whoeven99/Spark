import { createHmac } from "node:crypto";

const LOG_REQUEST = "[AidgeRequest]";
const LOG_ERROR = "[AidgeError]";

export type AidgeIopCredentials = {
  accessKeyId: string;
  accessKeySecret: string;
};

export function readAidgeIopCredentials(): AidgeIopCredentials | null {
  const accessKeyId =
    process.env.AIDGE_ACCESS_KEY_ID?.trim() ||
    process.env.AIDGE_ACCESS_KEY_NAME?.trim() ||
    "";
  const accessKeySecret =
    process.env.AIDGE_ACCESS_KEY_SECRET?.trim() || "";
  if (!accessKeyId || !accessKeySecret) return null;
  return { accessKeyId, accessKeySecret };
}

export function resolveAidgeApiBaseUrl(): string {
  const raw =
    process.env.AIDGE_BASE_URL?.trim() || "https://cn-api.aidc-ai.com";
  return raw.replace(/\/+$/, "");
}

export function resolveAidgeImageTranslateApiPath(): string {
  const raw =
    process.env.AIDGE_IMAGE_TRANSLATE_PATH?.trim() ||
    process.env.AIDGE_IMAGE_TRANSLATE_API?.trim() ||
    "/ai/image/translation";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** IOP 网关路径前缀（与官方 SDK `IopClient` 一致：`{base}/rest{apiName}`）。 */
export function resolveAidgeIopGatewayPath(): string {
  const raw = process.env.AIDGE_IOP_GATEWAY_PATH?.trim() || "/rest";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** 将业务 API 名拼成可 POST 的 IOP URL 路径（含 `/rest` 前缀）。 */
export function resolveAidgeIopRequestUrl(apiName: string): string {
  const apiPath = apiName.startsWith("/") ? apiName : `/${apiName}`;
  const gatewayPath = resolveAidgeIopGatewayPath();
  if (apiPath === gatewayPath || apiPath.startsWith(`${gatewayPath}/`)) {
    return apiPath;
  }
  return `${gatewayPath}${apiPath}`;
}

function resolveAidgeRequestTimeoutMs(): number {
  const raw = process.env.AIDGE_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : 30_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function resolvePartnerId(): string {
  return process.env.AIDGE_PARTNER_ID?.trim() || "iop";
}

/** IOP HMAC-SHA256 签名（与 Lazada / AliExpress IOP SDK 同类算法）。 */
export function signIopRequest(params: {
  apiName: string;
  businessParams: Record<string, string>;
  accessKeyId: string;
  accessKeySecret: string;
  timestampMs?: number;
}): Record<string, string> {
  const timestamp = String(params.timestampMs ?? Date.now());
  const signPayload: Record<string, string> = {
    app_key: params.accessKeyId,
    sign_method: "sha256",
    timestamp,
    partner_id: resolvePartnerId(),
    ...params.businessParams,
  };

  const keys = Object.keys(signPayload).sort();
  let base = params.apiName;
  for (const key of keys) {
    base += key + signPayload[key];
  }

  const sign = createHmac("sha256", params.accessKeySecret)
    .update(base)
    .digest("hex")
    .toUpperCase();

  return { ...signPayload, sign };
}

export type AidgeIopExecuteFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
  httpStatus?: number;
};

export type AidgeIopExecuteOk = {
  ok: true;
  body: unknown;
  elapsedMs: number;
};

export async function executeAidgeIopRequest(params: {
  apiName: string;
  businessParams: Record<string, string>;
  credentials: AidgeIopCredentials;
}): Promise<AidgeIopExecuteOk | AidgeIopExecuteFailure> {
  const apiPath = params.apiName.startsWith("/")
    ? params.apiName
    : `/${params.apiName}`;
  const requestPath = resolveAidgeIopRequestUrl(apiPath);
  const url = `${resolveAidgeApiBaseUrl()}${requestPath}`;
  const signed = signIopRequest({
    apiName: apiPath,
    businessParams: params.businessParams,
    accessKeyId: params.credentials.accessKeyId,
    accessKeySecret: params.credentials.accessKeySecret,
  });

  const body = new URLSearchParams(signed);
  const timeoutMs = resolveAidgeRequestTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const trialFlag = process.env.AIDGE_IOP_TRIAL?.trim() === "true";
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
  };
  if (trialFlag) {
    headers["x-iop-trial"] = "true";
  }

  console.info(
    `${LOG_REQUEST} POST host=${new URL(url).host} path=${requestPath} timeoutMs=${timeoutMs} trial=${String(trialFlag)} paramKeys=${Object.keys(params.businessParams).join(",")}`,
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body.toString(),
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      // keep raw text
    }

    const bodyPreview =
      typeof parsed === "object" && parsed != null
        ? JSON.stringify(parsed).slice(0, 600)
        : text.slice(0, 600);
    console.info(
      `${LOG_REQUEST} response httpStatus=${res.status} elapsedMs=${elapsedMs} bodyLength=${text.length} bodyPreview=${bodyPreview}`,
    );

    if (!res.ok) {
      return {
        ok: false,
        reasonCode: "aidge_http_error",
        detail: `HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }

    return { ok: true, body: parsed, elapsedMs };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const elapsedMs = Date.now() - startedAt;
    console.error(
      `${LOG_ERROR} request failed elapsedMs=${elapsedMs} detail=${detail}`,
    );
    const isTimeout = /abort/i.test(detail);
    return {
      ok: false,
      reasonCode: isTimeout ? "aidge_timeout" : "aidge_request_failed",
      detail,
    };
  } finally {
    clearTimeout(timer);
  }
}
