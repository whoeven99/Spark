import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleAdsSandboxPending,
  getGoogleAdsSandboxPending,
  setGoogleAdsSandboxCredential,
} from "../server/adsCatalog/credentialStore.server";
import { getGoogleAdsDeveloperToken } from "../server/adsCatalog/googleOAuth.server";
import {
  normalizeCustomerId,
  resolveLoginCustomerId,
} from "../server/adsCatalog/googleAdsApi.server";

/**
 * GET/POST /api/ads-insights/google-sandbox-accounts
 * 测试账号多客户选择。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getGoogleAdsSandboxPending(session.shop);
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

  const pending = await getGoogleAdsSandboxPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的测试账号授权会话，请重新授权" },
      { status: 409 },
    );
  }
  const selected = pending.accounts.find((a) => a.id === customerId);
  if (!selected) {
    return Response.json({ ok: false, error: "customerId 不在授权账号列表中" }, { status: 400 });
  }

  const developerToken = getGoogleAdsDeveloperToken();
  const preferredLogin = selected.loginCustomerId?.trim();
  let loginCustomerId = preferredLogin || normalizeCustomerId(customerId);
  if (developerToken) {
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

  await setGoogleAdsSandboxCredential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    customerId,
    loginCustomerId,
    descriptiveName: selected.name,
  });
  await clearGoogleAdsSandboxPending(session.shop);

  return Response.json({ ok: true, customerId, loginCustomerId });
};
