import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleAdsPending,
  getGoogleAdsCredential,
  getGoogleAdsPending,
  setGoogleAdsCredential,
  type PendingOAuthAccount,
} from "../server/adsCatalog/credentialStore.server";
import {
  getAdsCustomers,
  getGoogleAdsDeveloperToken,
  type AdsCustomer,
} from "../server/adsCatalog/googleOAuth.server";
import { maybeRefreshGoogleAdsToken } from "../server/adsCatalog/googleAdsToken.server";
import { resolveLoginCustomerId, normalizeCustomerId } from "../server/adsCatalog/googleAdsApi.server";

function mapAdsCustomers(customers: AdsCustomer[]): PendingOAuthAccount[] {
  return customers.map((c) => ({
    id: c.customerId,
    formatted: c.formatted,
    name: c.descriptiveName,
    loginCustomerId: c.loginCustomerId,
  }));
}

async function resolveGoogleAdsAccounts(shop: string): Promise<PendingOAuthAccount[]> {
  const pending = await getGoogleAdsPending(shop);
  if (pending?.accounts.length) {
    return pending.accounts;
  }

  const cred = await getGoogleAdsCredential(shop);
  if (!cred) return [];

  if (cred.availableAccounts?.length) {
    return cred.availableAccounts;
  }

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) return [];

  const accessToken = (await maybeRefreshGoogleAdsToken(shop)) ?? cred.accessToken;
  const customers = await getAdsCustomers(accessToken, developerToken);
  const accounts = mapAdsCustomers(customers);
  if (accounts.length > 0) {
    await setGoogleAdsCredential(shop, {
      accessToken,
      refreshToken: cred.refreshToken,
      customerId: cred.customerId,
      loginCustomerId: cred.loginCustomerId,
      availableAccounts: accounts,
    });
  }
  return accounts;
}

async function resolveLoginCustomerIdForAccount(params: {
  accessToken: string;
  customerId: string;
  preferredLogin?: string;
  accounts: PendingOAuthAccount[];
}): Promise<string> {
  const developerToken = getGoogleAdsDeveloperToken();
  const preferredLogin = params.preferredLogin?.trim();
  let loginCustomerId = preferredLogin || normalizeCustomerId(params.customerId);
  if (developerToken) {
    loginCustomerId = await resolveLoginCustomerId({
      accessToken: params.accessToken,
      developerToken,
      customerId: params.customerId,
      accessibleCustomerIds: [
        ...(preferredLogin ? [preferredLogin] : []),
        ...params.accounts.map((a) => a.loginCustomerId ?? a.id),
      ],
    });
  }
  return loginCustomerId;
}

/**
 * GET/POST /api/ads-catalog/google-ads-accounts
 * 多广告账户选择与切换。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const accounts = await resolveGoogleAdsAccounts(session.shop);
    return Response.json({ ok: true, accounts });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Google Ads 账户列表获取失败",
      },
      { status: 500 },
    );
  }
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
  if (pending) {
    if (!pending.accounts.some((a) => a.id === customerId)) {
      return Response.json({ ok: false, error: "customerId 不在授权账号列表中" }, { status: 400 });
    }

    const selected = pending.accounts.find((a) => a.id === customerId);
    const loginCustomerId = await resolveLoginCustomerIdForAccount({
      accessToken: pending.accessToken,
      customerId,
      preferredLogin: selected?.loginCustomerId,
      accounts: pending.accounts,
    });

    await setGoogleAdsCredential(session.shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      customerId,
      loginCustomerId,
      availableAccounts: pending.accounts,
    });
    await clearGoogleAdsPending(session.shop);

    return Response.json({ ok: true, customerId, loginCustomerId });
  }

  const cred = await getGoogleAdsCredential(session.shop);
  if (!cred) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新绑定 Google Ads" },
      { status: 409 },
    );
  }

  if (cred.customerId === customerId) {
    return Response.json({ ok: true, customerId });
  }

  const accounts = cred.availableAccounts?.length
    ? cred.availableAccounts
    : await resolveGoogleAdsAccounts(session.shop);
  const selected = accounts.find((a) => a.id === customerId);
  if (!selected) {
    return Response.json({ ok: false, error: "customerId 不在授权账号列表中" }, { status: 400 });
  }

  const accessToken = (await maybeRefreshGoogleAdsToken(session.shop)) ?? cred.accessToken;
  const loginCustomerId = await resolveLoginCustomerIdForAccount({
    accessToken,
    customerId,
    preferredLogin: selected.loginCustomerId,
    accounts,
  });

  await setGoogleAdsCredential(session.shop, {
    accessToken,
    refreshToken: cred.refreshToken,
    customerId,
    loginCustomerId,
    availableAccounts: accounts,
  });

  return Response.json({ ok: true, customerId, loginCustomerId });
};
