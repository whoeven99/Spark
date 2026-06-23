/**
 * Google Ads REST API 公共工具：请求头、错误解析、login-customer-id 解析。
 *
 * 通过 MCC 访问子账户时，必须在请求头携带 login-customer-id（经理账户 ID），
 * 否则 Google Ads API 会返回 HTTP 403 PERMISSION_DENIED。
 */

import { formatOutboundErrorLog } from "../common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][GoogleAdsApi]";

/** Google Ads REST API 主版本（v17 已于 2025-06-04 下线，请求会返回 404）。 */
export const GOOGLE_ADS_API_VERSION = "v24";

export function googleAdsApiUrl(path: string): string {
  return `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}${path}`;
}

export function normalizeCustomerId(id: string): string {
  return id.replace(/\D/g, "");
}

export function buildGoogleAdsHeaders(params: {
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    "developer-token": params.developerToken,
  };
  if (params.loginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(params.loginCustomerId);
  }
  return headers;
}

export function parseGoogleAdsError(text: string, status: number): string {
  if (!text.trim()) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const err = (item as { error?: { message?: string; details?: unknown[] } }).error;
      if (err?.message) return err.message;
      if (Array.isArray(err?.details)) {
        for (const detail of err.details) {
          if (!detail || typeof detail !== "object") continue;
          const errors = (detail as { errors?: Array<{ message?: string }> }).errors;
          if (errors?.[0]?.message) return errors[0].message;
        }
      }
    }
  } catch {
    // ignore parse error
  }
  return `HTTP ${status}`;
}

/** 探测是否可用指定 login-customer-id 访问目标账户。 */
export async function probeCustomerAccess(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
}): Promise<boolean> {
  const customerId = normalizeCustomerId(params.customerId);
  const url = googleAdsApiUrl(`/customers/${customerId}/googleAds:searchStream`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }),
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=probe_customer_access customerId=${customerId} loginCustomerId=${params.loginCustomerId} ${formatOutboundErrorLog(e)}`,
    );
    return false;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(
      `${LOG_PREFIX} step=probe_customer_access customerId=${customerId} loginCustomerId=${params.loginCustomerId} status=${response.status} body=${text.slice(0, 200)}`,
    );
  }
  return response.ok;
}

async function listAccessibleCustomerIds(
  accessToken: string,
  developerToken: string,
): Promise<string[]> {
  const url = googleAdsApiUrl("/customers:listAccessibleCustomers");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: buildGoogleAdsHeaders({ accessToken, developerToken }),
    });
  } catch (e) {
    console.error(`${LOG_PREFIX} step=list_accessible_customers url=${url} ${formatOutboundErrorLog(e)}`);
    throw e;
  }
  const json = (await response.json().catch(() => ({}))) as {
    resourceNames?: string[];
    error?: { message?: string };
  };
  if (!response.ok) {
    console.error(
      `${LOG_PREFIX} step=list_accessible_customers status=${response.status} message=${json.error?.message ?? "unknown"}`,
    );
    return [];
  }
  const ids = (json.resourceNames ?? []).map((name) => name.replace(/^customers\//, ""));
  console.info(`${LOG_PREFIX} step=list_accessible_customers count=${ids.length}`);
  return ids;
}

/**
 * 解析访问目标账户时应使用的 login-customer-id。
 * 直连账户返回自身 ID；MCC 子账户返回可访问的经理账户 ID。
 */
export async function resolveLoginCustomerId(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  accessibleCustomerIds?: string[];
}): Promise<string> {
  const targetId = normalizeCustomerId(params.customerId);

  if (
    await probeCustomerAccess({
      accessToken: params.accessToken,
      developerToken: params.developerToken,
      customerId: targetId,
      loginCustomerId: targetId,
    })
  ) {
    return targetId;
  }

  let candidates = params.accessibleCustomerIds?.map(normalizeCustomerId) ?? [];
  if (candidates.length === 0) {
    candidates = await listAccessibleCustomerIds(params.accessToken, params.developerToken);
  }

  for (const managerId of candidates) {
    if (managerId === targetId) continue;
    if (
      await probeCustomerAccess({
        accessToken: params.accessToken,
        developerToken: params.developerToken,
        customerId: targetId,
        loginCustomerId: managerId,
      })
    ) {
      return managerId;
    }
  }

  return targetId;
}
