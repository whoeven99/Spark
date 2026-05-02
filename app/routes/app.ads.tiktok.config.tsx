import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTikTokCredential,
  maskToken,
  setTikTokCredential,
} from "../server/adAuthCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getTikTokCredential(session.shop);
  return Response.json({
    configured: Boolean(config),
    appIdMasked: config ? maskToken(config.appId) : "",
    updatedAt: config?.updatedAt ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    appId?: string;
    appSecret?: string;
    advertiserId?: string;
  };

  const appId = body.appId?.trim() ?? "";
  const appSecret = body.appSecret?.trim() ?? "";
  const advertiserId = body.advertiserId?.trim() ?? "";

  if (!appId || !appSecret || !advertiserId) {
    return Response.json(
      { ok: false, error: "TikTok Ads 的 App ID、App Secret、Advertiser ID 不能为空" },
      { status: 400 },
    );
  }

  await setTikTokCredential(session.shop, appId, appSecret, advertiserId);
  return Response.json({
    ok: true,
    configured: true,
    appIdMasked: maskToken(appId),
  });
};

