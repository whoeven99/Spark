import { createHmac, randomUUID } from "node:crypto";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getAdProviderCredential } from "../server/adsCredentialStore.server";

type MetaStatePayload = {
  nonce: string;
  shop: string;
  host: string;
  ts: number;
};

function encodeState(payload: MetaStatePayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${signature}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || source.origin;
  const stateSigningSecret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_KEY;
  if (!stateSigningSecret) {
    const url = new URL(request.url);
    url.pathname = "/app";
    url.searchParams.set("adAuth", "meta_error");
    url.searchParams.set("reason", "缺少 Shopify API Secret，无法校验 OAuth state");
    return redirect(url.pathname + url.search);
  }

  const host = source.searchParams.get("host") ?? "";
  const shop = source.searchParams.get("shop") ?? session.shop;
  const metaConfig = await getAdProviderCredential(shop, "meta");
  if (!metaConfig) {
    const url = new URL(request.url);
    url.pathname = "/app";
    url.searchParams.set("shop", shop);
    if (host) url.searchParams.set("host", host);
    url.searchParams.set("adAuth", "meta_error");
    url.searchParams.set("reason", "请先在界面填写并保存 Meta App ID/Secret");
    return redirect(url.pathname + url.search);
  }

  const state = encodeState(
    { nonce: randomUUID(), shop, host, ts: Date.now() },
    stateSigningSecret,
  );

  const callbackUrl = new URL("/ads/meta/callback", appUrl).toString();
  const authUrl = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  authUrl.searchParams.set("client_id", metaConfig.clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "ads_read,business_management");

  return redirect(authUrl.toString());
};

