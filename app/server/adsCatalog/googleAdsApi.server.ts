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

/**
 * 解析 Google Ads API 错误正文。
 * 优先取 details[].errors[].message（如 REQUESTED_METRICS_FOR_MANAGER 的具体说明），
 * 避免只返回顶层笼统的 "Request contains an invalid argument."。
 */
export function parseGoogleAdsError(text: string, status: number): string {
  if (!text.trim()) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    let topLevelMessage: string | undefined;
    let errorCodeHint: string | undefined;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const err = (item as { error?: { message?: string; details?: unknown[] } }).error;
      if (!err) continue;
      if (Array.isArray(err.details)) {
        for (const detail of err.details) {
          if (!detail || typeof detail !== "object") continue;
          const errors = (
            detail as {
              errors?: Array<{
                message?: string;
                errorCode?: Record<string, string>;
              }>;
            }
          ).errors;
          const first = errors?.[0];
          const detailMessage = first?.message?.trim();
          if (detailMessage) return detailMessage;
          if (!errorCodeHint && first?.errorCode) {
            const code = Object.values(first.errorCode).find((v) => typeof v === "string" && v.trim());
            if (code) errorCodeHint = code;
          }
        }
      }
      if (err.message?.trim() && !topLevelMessage) {
        topLevelMessage = err.message.trim();
      }
    }
    if (topLevelMessage && errorCodeHint && topLevelMessage === "The caller does not have permission") {
      return `${topLevelMessage} (${errorCodeHint})`;
    }
    if (topLevelMessage) return topLevelMessage;
    if (errorCodeHint) return errorCodeHint;
  } catch {
    // ignore parse error
  }
  return `HTTP ${status}`;
}

export type GoogleAdsErrorKind =
  | "manager"
  | "permission"
  | "developer_token"
  | "other";

export function classifyGoogleAdsError(detail: string): GoogleAdsErrorKind {
  if (/manager account|REQUESTED_METRICS_FOR_MANAGER/i.test(detail)) return "manager";
  if (
    /DEVELOPER_TOKEN_NOT_APPROVED|only approved for use with test accounts|DEVELOPER_TOKEN_NOT_ON_ALLOWLIST/i.test(
      detail,
    )
  ) {
    return "developer_token";
  }
  if (
    /permission|USER_PERMISSION_DENIED|PERMISSION_DENIED|login-customer-id|INVALID_LOGIN_CUSTOMER_ID/i.test(
      detail,
    )
  ) {
    return "permission";
  }
  return "other";
}

/** 将 Google Ads API 原始错误转成可操作的中文提示。 */
export function formatGoogleAdsUserError(detail: string): string {
  switch (classifyGoogleAdsError(detail)) {
    case "manager":
      return "当前绑定的是 Google Ads 经理账户（MCC），无法拉取广告投放指标。请重新授权并选择具体的广告客户账户（非 MCC）。";
    case "developer_token":
      return "GOOGLE_ADS_DEVELOPER_TOKEN 可能仍是测试级（仅能访问测试账户）。请到 Google Ads API Center 申请 Basic/Standard 权限后更换正式 token。";
    case "permission":
      return "无权访问该 Google Ads 客户账户。常见原因：通过 MCC 管理时缺少正确的 login-customer-id，或 OAuth 账号对该客户无权限。请断开后重新授权，并选择你有权限的客户账户。";
    default:
      return `Google Ads API 错误: ${detail}`;
  }
}

export function isGoogleAdsPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return classifyGoogleAdsError(message) === "permission" || /无权访问该 Google Ads/i.test(message);
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

  // 候选顺序：调用方偏好（展开 MCC 时的经理账户）→ 显式传入 → listAccessibleCustomers。
  const provided = params.accessibleCustomerIds?.map(normalizeCustomerId) ?? [];
  const listed = await listAccessibleCustomerIds(params.accessToken, params.developerToken);
  const candidates = [...new Set([...provided, ...listed])];

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

interface CustomerGaqlRow {
  customer?: {
    id?: string;
    descriptive_name?: string;
    manager?: boolean | string;
  };
  customerClient?: {
    client_customer?: string;
    descriptive_name?: string;
    manager?: boolean | string;
    status?: string;
  };
}

function isManagerFlag(value: boolean | string | undefined): boolean {
  return value === true || value === "true" || value === "TRUE";
}

async function executeCustomerGaql(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  query: string;
}): Promise<CustomerGaqlRow[]> {
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
      body: JSON.stringify({ query: params.query }),
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=customer_gaql customerId=${customerId} ${formatOutboundErrorLog(e)}`,
    );
    return [];
  }
  const text = await response.text();
  if (!response.ok) {
    console.warn(
      `${LOG_PREFIX} step=customer_gaql customerId=${customerId} status=${response.status} body=${text.slice(0, 300)}`,
    );
    return [];
  }
  try {
    const parsed = JSON.parse(text) as { results?: CustomerGaqlRow[] } | Array<{ results?: CustomerGaqlRow[] }>;
    const batches = Array.isArray(parsed) ? parsed : [parsed];
    return batches.flatMap((b) => b.results ?? []);
  } catch {
    return [];
  }
}

export type SelectableAdsCustomer = {
  customerId: string;
  /** 经理账户 ID；直连客户账户时等于自身。 */
  loginCustomerId: string;
  descriptiveName?: string;
};

/**
 * 列出可用于拉取广告指标的客户账户。
 * listAccessibleCustomers 常返回 MCC；对经理账户展开 customer_client，并跳过经理账户本身。
 */
export async function listSelectableAdsCustomers(params: {
  accessToken: string;
  developerToken: string;
}): Promise<SelectableAdsCustomer[]> {
  const accessibleIds = await listAccessibleCustomerIds(
    params.accessToken,
    params.developerToken,
  );
  const out: SelectableAdsCustomer[] = [];
  const seen = new Set<string>();

  const pushClient = (customerId: string, loginCustomerId: string, descriptiveName?: string) => {
    const id = normalizeCustomerId(customerId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      customerId: id,
      loginCustomerId: normalizeCustomerId(loginCustomerId),
      descriptiveName: descriptiveName?.trim() || undefined,
    });
  };

  for (const accessibleId of accessibleIds) {
    const selfRows = await executeCustomerGaql({
      accessToken: params.accessToken,
      developerToken: params.developerToken,
      customerId: accessibleId,
      loginCustomerId: accessibleId,
      query: "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1",
    });
    const self = selfRows[0]?.customer;
    if (!self?.id && !accessibleId) continue;

    if (isManagerFlag(self?.manager)) {
      const clientRows = await executeCustomerGaql({
        accessToken: params.accessToken,
        developerToken: params.developerToken,
        customerId: accessibleId,
        loginCustomerId: accessibleId,
        query: `
          SELECT
            customer_client.client_customer,
            customer_client.descriptive_name,
            customer_client.manager,
            customer_client.status
          FROM customer_client
          WHERE customer_client.status = 'ENABLED'
            AND customer_client.manager = FALSE
        `,
      });
      for (const row of clientRows) {
        const resource = row.customerClient?.client_customer ?? "";
        const clientId = resource.replace(/^customers\//, "");
        if (!clientId) continue;
        pushClient(clientId, accessibleId, row.customerClient?.descriptive_name);
      }
      continue;
    }

    pushClient(accessibleId, accessibleId, self?.descriptive_name);
  }

  console.info(
    `${LOG_PREFIX} step=list_selectable_ads_customers accessible=${accessibleIds.length} selectable=${out.length}`,
  );
  return out;
}
