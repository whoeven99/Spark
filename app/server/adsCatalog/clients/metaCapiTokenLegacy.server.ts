import crypto from "node:crypto";
import { META_GRAPH_BASE, META_GRAPH_VERSION } from "../metaOAuth.server";
import {
  formatFieldsForLog,
  formatMetaCapiTokenForLog,
  formatUrlForLog,
  logFullMetaCapiAccessToken,
  shouldLogFullMetaCapiErrorBody,
} from "../metaCapiLog.server";

const LOG_PREFIX = "[AdsCatalog][MetaCapiToken]";
const CAPI_TOKEN_SCOPES = "ads_management,business_management,pages_show_list";

type MetaGraphErrorPayload = {
  error?: { message?: string; error_user_msg?: string; code?: number };
  access_token?: string;
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
  console.info(
    `${LOG_PREFIX} step=graph_request method=POST url=${formatUrlForLog(url)} body=${formatFieldsForLog({ ...params.fields, access_token: params.accessToken })}`,
  );
  const response = await fetch(url, { method: "POST", body });
  const parsed = await parseGraphResponse(response);
  const bodyPreview = shouldLogFullMetaCapiErrorBody()
    ? parsed.text
    : parsed.text.slice(0, 800);
  console.info(
    `${LOG_PREFIX} step=graph_response method=POST http=${response.status} ok=${parsed.ok} body=${bodyPreview}`,
  );
  if (!parsed.ok) {
    throw new Error(
      readGraphError(parsed.payload, parsed.text.slice(0, 200) || response.statusText),
    );
  }
  return parsed.payload;
}

/** FBE 老路径：POST /{businessId}/access_token */
export async function requestBusinessManagerAccessToken(params: {
  businessId: string;
  shop: string;
  pixelId?: string;
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
      logFullMetaCapiAccessToken({
        token,
        source: "legacy_fbe_business_access_token",
        shop: params.shop,
        pixelId: params.pixelId,
      });
      console.info(
        `${LOG_PREFIX} step=business_access_token_ok shop=${params.shop} businessId=${params.businessId} token=${formatMetaCapiTokenForLog(token)} tokenLen=${token.length}`,
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
