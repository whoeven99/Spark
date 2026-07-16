import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleAdsPending,
  getGoogleAdsPending,
  setGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import {
  getGoogleAdsDeveloperToken,
} from "../server/adsCatalog/googleOAuth.server";
import { resolveLoginCustomerId, normalizeCustomerId } from "../server/adsCatalog/googleAdsApi.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getGoogleAdsPending(session.shop);
  return Response.json({ ok: true, accounts: pending?.accounts ?? [] });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as { customerId?: string };
  const customerId = body.customerId?.trim();
  if (!customerId) {
    return Response.json({ ok: false, error: "customerId is required" }, { status: 400 });
  }

  const pending = await getGoogleAdsPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新绑定 Google Ads" },
      { status: 409 },
    );
  }
  if (!pending.accounts.some((a) => a.id === customerId)) {
    return Response.json({ ok: false, error: "customerId 不在授权账号列表中" }, { status: 400 });
  }

  const developerToken = getGoogleAdsDeveloperToken();
  const selected = pending.accounts.find((a) => a.id === customerId);
  const preferredLogin = selected?.loginCustomerId?.trim();
  let loginCustomerId = preferredLogin || normalizeCustomerId(customerId);
  if (developerToken) {
    // 始终探测解析，避免把「仅能通过 MCC 访问的子账户」错误写成 login=自身。
    loginCustomerId = await resolveLoginCustomerId({
      accessToken: pending.accessToken,
      developerToken,
      customerId,
      accessibleCustomerIds: [
        ...(preferredLogin ? [preferredLogin] : []),
        ...pending.accounts.map((a) => a.loginCustomerId ?? a.id),
      ],
    });
  }

  await setGoogleAdsCredential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    customerId,
    loginCustomerId,
  });
  await clearGoogleAdsPending(session.shop);

  return Response.json({ ok: true, customerId, loginCustomerId });
};
