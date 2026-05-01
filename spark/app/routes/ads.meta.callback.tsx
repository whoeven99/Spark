import { createHmac } from "node:crypto";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getAdProviderCredential } from "../server/adsCredentialStore.server";

type MetaStatePayload = {
  nonce: string;
  shop: string;
  host: string;
  ts: number;
};

function decodeAndVerifyState(state: string, secret: string): MetaStatePayload {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new Error("state 格式错误");
  }
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (signature !== expected) {
    throw new Error("state 签名无效");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MetaStatePayload;
  if (!payload.ts || Date.now() - payload.ts > 10 * 60 * 1000) {
    throw new Error("state 已过期，请重新授权");
  }
  return payload;
}

function buildAppRedirect(baseAppUrl: string, payload?: Partial<MetaStatePayload>) {
  const target = new URL("/app", baseAppUrl);
  if (payload?.shop) target.searchParams.set("shop", payload.shop);
  if (payload?.host) target.searchParams.set("host", payload.host);
  return target;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || incoming.origin;
  const stateSigningSecret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_KEY;
  if (!stateSigningSecret) {
    const target = buildAppRedirect(appUrl);
    target.searchParams.set("adAuth", "meta_error");
    target.searchParams.set("reason", "缺少 Shopify API Secret，无法校验 OAuth state");
    return redirect(target.toString());
  }

  const state = incoming.searchParams.get("state") ?? "";
  const errorReason = incoming.searchParams.get("error_reason");
  const code = incoming.searchParams.get("code");

  let statePayload: MetaStatePayload | undefined;
  try {
    statePayload = decodeAndVerifyState(state, stateSigningSecret);
  } catch (error) {
    const target = buildAppRedirect(appUrl);
    target.searchParams.set("adAuth", "meta_error");
    target.searchParams.set(
      "reason",
      error instanceof Error ? error.message : "state 校验失败",
    );
    return redirect(target.toString());
  }

  const target = buildAppRedirect(appUrl, statePayload);
  const metaConfig = await getAdProviderCredential(statePayload.shop, "meta");
  if (!metaConfig) {
    target.searchParams.set("adAuth", "meta_error");
    target.searchParams.set("reason", "未找到 Meta 配置，请先在界面保存 App ID/Secret");
    return redirect(target.toString());
  }

  if (errorReason) {
    target.searchParams.set("adAuth", "meta_cancelled");
    return redirect(target.toString());
  }
  if (!code) {
    target.searchParams.set("adAuth", "meta_error");
    target.searchParams.set("reason", "Meta 未返回授权 code");
    return redirect(target.toString());
  }

  try {
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", metaConfig.clientId);
    tokenUrl.searchParams.set("client_secret", metaConfig.clientSecret);
    tokenUrl.searchParams.set("redirect_uri", new URL("/ads/meta/callback", appUrl).toString());
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      const reason = tokenPayload.error?.message || `HTTP ${tokenResponse.status}`;
      target.searchParams.set("adAuth", "meta_error");
      target.searchParams.set("reason", reason);
      return redirect(target.toString());
    }

    // TODO: 将 token 持久化到数据库（按 shop + provider 存储）。
    target.searchParams.set("adAuth", "meta_success");
    return redirect(target.toString());
  } catch (error) {
    target.searchParams.set("adAuth", "meta_error");
    target.searchParams.set(
      "reason",
      error instanceof Error ? error.message : "Meta token 交换失败",
    );
    return redirect(target.toString());
  }
};

