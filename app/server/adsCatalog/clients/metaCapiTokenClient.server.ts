import crypto from "node:crypto";
import { META_GRAPH_BASE, META_GRAPH_VERSION } from "../metaOAuth.server";

const LOG_PREFIX = "[AdsCatalog][MetaCapiToken]";
const SYSTEM_USER_NAME = "Spark CAPI";
const CAPI_TOKEN_SCOPES = "ads_management,business_management,pages_show_list";
/** Meta assigned_users tasks enum — no "MANAGE"; UI "Manage" maps to EDIT (+ others). */
const PIXEL_ASSIGN_TASKS = ["EDIT", "ANALYZE", "ADVERTISE", "UPLOAD"] as const;

type MetaGraphErrorPayload = {
  error?: { message?: string; error_user_msg?: string; code?: number };
  access_token?: string;
  id?: string;
  data?: Array<{ id?: string; name?: string }>;
};

export function buildMetaAppsecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function graphBase(apiVersion?: string): string {
  return `${META_GRAPH_BASE.replace(META_GRAPH_VERSION, apiVersion || META_GRAPH_VERSION)}`;
}

function readGraphError(payload: MetaGraphErrorPayload, fallback: string): string {
  return (
    payload.error?.error_user_msg?.trim() ||
    payload.error?.message?.trim() ||
    fallback
  );
}

async function parseGraphResponse(response: Response): Promise<{
  ok: boolean;
  payload: MetaGraphErrorPayload;
  text: string;
}> {
  const text = await response.text();
  let payload: MetaGraphErrorPayload = {};
  try {
    payload = text ? (JSON.parse(text) as MetaGraphErrorPayload) : {};
  } catch {
    payload = {};
  }
  return { ok: response.ok && !payload.error, payload, text };
}

async function postGraphForm(params: {
  path: string;
  accessToken: string;
  fields: Record<string, string>;
  apiVersion?: string;
}): Promise<MetaGraphErrorPayload> {
  const url = `${graphBase(params.apiVersion)}/${params.path.replace(/^\//, "")}`;
  const body = new URLSearchParams({ ...params.fields, access_token: params.accessToken });
  const response = await fetch(url, { method: "POST", body });
  const parsed = await parseGraphResponse(response);
  if (!parsed.ok) {
    throw new Error(
      readGraphError(parsed.payload, parsed.text.slice(0, 200) || response.statusText),
    );
  }
  return parsed.payload;
}

async function getGraphJson(params: {
  path: string;
  accessToken: string;
  searchParams?: Record<string, string>;
  apiVersion?: string;
}): Promise<MetaGraphErrorPayload> {
  const url = new URL(`${graphBase(params.apiVersion)}/${params.path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", params.accessToken);
  for (const [key, value] of Object.entries(params.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString());
  const parsed = await parseGraphResponse(response);
  if (!parsed.ok) {
    throw new Error(
      readGraphError(parsed.payload, parsed.text.slice(0, 200) || response.statusText),
    );
  }
  return parsed.payload;
}

async function requestBusinessManagerAccessToken(params: {
  businessId: string;
  shop: string;
  oauthAccessToken: string;
  appId: string;
  appSecret: string;
  apiVersion?: string;
}): Promise<string | null> {
  const appsecretProof = buildMetaAppsecretProof(params.oauthAccessToken, params.appSecret);
  try {
    const payload = await postGraphForm({
      path: `${encodeURIComponent(params.businessId)}/access_token`,
      accessToken: params.oauthAccessToken,
      apiVersion: params.apiVersion,
      fields: {
        app_id: params.appId,
        scope: `${CAPI_TOKEN_SCOPES},manage_business_extension`,
        fbe_external_business_id: params.shop.trim().toLowerCase(),
        appsecret_proof: appsecretProof,
      },
    });
    const token = payload.access_token?.trim();
    if (token) {
      console.info(
        `${LOG_PREFIX} step=business_access_token_ok shop=${params.shop} businessId=${params.businessId}`,
      );
      return token;
    }
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=business_access_token_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return null;
}

async function listBusinessSystemUsers(params: {
  businessId: string;
  oauthAccessToken: string;
  apiVersion?: string;
}): Promise<Array<{ id: string; name: string }>> {
  const payload = await getGraphJson({
    path: `${encodeURIComponent(params.businessId)}/system_users`,
    accessToken: params.oauthAccessToken,
    searchParams: { fields: "id,name" },
    apiVersion: params.apiVersion,
  });
  return (payload.data ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: String(row.name ?? "").trim(),
    }))
    .filter((row) => row.id);
}

async function createBusinessSystemUser(params: {
  businessId: string;
  oauthAccessToken: string;
  apiVersion?: string;
}): Promise<string> {
  const payload = await postGraphForm({
    path: `${encodeURIComponent(params.businessId)}/system_users`,
    accessToken: params.oauthAccessToken,
    apiVersion: params.apiVersion,
    fields: {
      name: SYSTEM_USER_NAME,
      role: "EMPLOYEE",
    },
  });
  const systemUserId = payload.id?.trim();
  if (!systemUserId) {
    throw new Error("Meta 未返回 system user id");
  }
  console.info(
    `${LOG_PREFIX} step=system_user_created businessId=${params.businessId} systemUserId=${systemUserId}`,
  );
  return systemUserId;
}

async function ensureSystemUserInstalledApp(params: {
  systemUserId: string;
  oauthAccessToken: string;
  appId: string;
  apiVersion?: string;
}): Promise<void> {
  try {
    await postGraphForm({
      path: `${encodeURIComponent(params.systemUserId)}/applications`,
      accessToken: params.oauthAccessToken,
      apiVersion: params.apiVersion,
      fields: {
        business_app: params.appId,
      },
    });
    console.info(
      `${LOG_PREFIX} step=system_user_app_installed systemUserId=${params.systemUserId} appId=${params.appId}`,
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/already|installed|duplicate/i.test(errMsg)) {
      console.info(
        `${LOG_PREFIX} step=system_user_app_already_installed systemUserId=${params.systemUserId}`,
      );
      return;
    }
    throw e;
  }
}

async function assignPixelToSystemUser(params: {
  pixelId: string;
  businessId: string;
  systemUserId: string;
  oauthAccessToken: string;
  apiVersion?: string;
}): Promise<void> {
  const url = new URL(
    `${graphBase(params.apiVersion)}/${encodeURIComponent(params.pixelId)}/assigned_users`,
  );
  url.searchParams.set("access_token", params.oauthAccessToken);
  url.searchParams.set("business", params.businessId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: params.systemUserId,
      tasks: [...PIXEL_ASSIGN_TASKS],
    }),
  });
  const parsed = await parseGraphResponse(response);
  if (!parsed.ok) {
    const errMsg = readGraphError(parsed.payload, parsed.text.slice(0, 200));
    if (/already|assigned|duplicate/i.test(errMsg)) {
      console.info(
        `${LOG_PREFIX} step=pixel_already_assigned pixelId=${params.pixelId} systemUserId=${params.systemUserId}`,
      );
      return;
    }
    throw new Error(errMsg);
  }
  console.info(
    `${LOG_PREFIX} step=pixel_assigned pixelId=${params.pixelId} systemUserId=${params.systemUserId}`,
  );
}

async function generateSystemUserAccessToken(params: {
  systemUserId: string;
  oauthAccessToken: string;
  appId: string;
  appSecret: string;
  apiVersion?: string;
}): Promise<string> {
  const payload = await postGraphForm({
    path: `${encodeURIComponent(params.systemUserId)}/access_tokens`,
    accessToken: params.oauthAccessToken,
    apiVersion: params.apiVersion,
    fields: {
      business_app: params.appId,
      scope: CAPI_TOKEN_SCOPES,
      set_token_expires_in_60_days: "true",
      appsecret_proof: buildMetaAppsecretProof(params.oauthAccessToken, params.appSecret),
    },
  });
  const token = payload.access_token?.trim();
  if (!token) {
    throw new Error("Meta 未返回 system user access token");
  }
  console.info(
    `${LOG_PREFIX} step=system_user_token_generated systemUserId=${params.systemUserId}`,
  );
  return token;
}

/**
 * 通过 Meta Business API 为指定 Pixel 换取 CAPI 专用 access token。
 * 优先尝试 Business Manager access_token（FBE 路径），失败则创建/复用 system user 生成 token。
 */
export async function fetchMetaPixelCapiAccessToken(params: {
  shop: string;
  pixelId: string;
  businessId: string;
  oauthAccessToken: string;
  appId: string;
  appSecret: string;
  apiVersion?: string;
}): Promise<string> {
  const shop = params.shop.trim().toLowerCase();
  const pixelId = params.pixelId.trim();
  const businessId = params.businessId.trim();
  const oauthAccessToken = params.oauthAccessToken.trim();
  const appId = params.appId.trim();
  const appSecret = params.appSecret.trim();

  if (!shop || !pixelId || !businessId || !oauthAccessToken || !appId || !appSecret) {
    throw new Error("自动获取 CAPI Token 缺少必要参数");
  }

  console.info(
    `${LOG_PREFIX} step=fetch_start shop=${shop} pixelId=${pixelId} businessId=${businessId}`,
  );

  const businessToken = await requestBusinessManagerAccessToken({
    businessId,
    shop,
    oauthAccessToken,
    appId,
    appSecret,
    apiVersion: params.apiVersion,
  });
  if (businessToken) return businessToken;

  const systemUsers = await listBusinessSystemUsers({
    businessId,
    oauthAccessToken,
    apiVersion: params.apiVersion,
  });
  let systemUserId =
    systemUsers.find((user) => user.name === SYSTEM_USER_NAME)?.id ??
    systemUsers[0]?.id ??
    "";

  if (!systemUserId) {
    systemUserId = await createBusinessSystemUser({
      businessId,
      oauthAccessToken,
      apiVersion: params.apiVersion,
    });
  } else {
    console.info(
      `${LOG_PREFIX} step=system_user_reused systemUserId=${systemUserId} businessId=${businessId}`,
    );
  }

  await ensureSystemUserInstalledApp({
    systemUserId,
    oauthAccessToken,
    appId,
    apiVersion: params.apiVersion,
  });
  await assignPixelToSystemUser({
    pixelId,
    businessId,
    systemUserId,
    oauthAccessToken,
    apiVersion: params.apiVersion,
  });

  return generateSystemUserAccessToken({
    systemUserId,
    oauthAccessToken,
    appId,
    appSecret,
    apiVersion: params.apiVersion,
  });
}
