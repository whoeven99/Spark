import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleMerchantPending,
  getGoogleMerchantPending,
  setGoogleMerchantCredential,
} from "../server/adsCatalog/credentialStore.server";
import { registerGmcNotificationSubscription } from "../server/adsCatalog/gmcNotifications.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getGoogleMerchantPending(session.shop);
  return Response.json({
    ok: true,
    accounts: pending?.accounts ?? [],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as { merchantId?: string };
  const merchantId = body.merchantId?.trim();
  if (!merchantId) {
    return Response.json({ ok: false, error: "merchantId is required" }, { status: 400 });
  }

  const pending = await getGoogleMerchantPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新连接 Merchant Center" },
      { status: 409 },
    );
  }
  if (!pending.accounts.some((a) => a.id === merchantId)) {
    return Response.json({ ok: false, error: "merchantId 不在授权账号列表中" }, { status: 400 });
  }

  await setGoogleMerchantCredential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    merchantId,
  });
  await clearGoogleMerchantPending(session.shop);

  // Best-effort: register Merchant Notifications subscription (non-blocking)
  void registerGmcNotificationSubscription({
    shop: session.shop,
    merchantId,
    accessToken: pending.accessToken,
  }).catch(() => undefined);

  return Response.json({ ok: true, merchantId });
};
