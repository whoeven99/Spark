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
import {
  buildGoogleAdsLoginVerifiedStamp,
  maybeRefreshGoogleAdsToken,
} from "../server/adsCatalog/googleAdsToken.server";
import {
  normalizeCustomerId,
  probeCustomerAccess,
  resolveLoginCustomerId,
} from "../server/adsCatalog/googleAdsApi.server";

function mapAdsCustomers(customers: AdsCustomer[]): PendingOAuthAccount[] {
  return customers.map((c) => ({
    id: c.customerId,
    formatted: c.formatted,
    name: c.descriptiveName,
    loginCustomerId: c.loginCustomerId,
  }));
}

async function fetchFreshGoogleAdsAccounts(shop: string): Promise<PendingOAuthAccount[]> {
  const cred = await getGoogleAdsCredential(shop);
  if (!cred) return [];

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
      loginCustomerIdVerifiedAt: cred.loginCustomerIdVerifiedAt,
      loginCustomerIdVerifiedForCustomerId: cred.loginCustomerIdVerifiedForCustomerId,
      availableAccounts: accounts,
    });
  }
  return accounts;
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

  return fetchFreshGoogleAdsAccounts(shop);
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
      preferredLoginCustomerId: preferredLogin,
      accessibleCustomerIds: params.accounts.map((a) => a.loginCustomerId ?? a.id),
    });
  }
  return loginCustomerId;
}

const ADS_ACCOUNT_ACCESS_DENIED =
  "无法切换到该 Google Ads 账户。常见原因：OAuth 账号对该客户无权限，或经理（MCC）login-customer-id 已过期。请断开 Google Ads 后重新授权，并选择具体广告客户账户（不要选 MCC 经理账户）。";

async function persistVerifiedAdsAccountSelection(params: {
  shop: string;
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  customerId: string;
  loginCustomerId: string;
  availableAccounts: PendingOAuthAccount[];
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    return { ok: false, error: "GOOGLE_ADS_DEVELOPER_TOKEN 环境变量未配置", status: 500 };
  }

  const reachable = await probeCustomerAccess({
    accessToken: params.accessToken,
    developerToken,
    customerId: params.customerId,
    loginCustomerId: params.loginCustomerId,
  });
  if (!reachable) {
    return { ok: false, error: ADS_ACCOUNT_ACCESS_DENIED, status: 409 };
  }

  await setGoogleAdsCredential(params.shop, {
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    customerId: params.customerId,
    loginCustomerId: params.loginCustomerId,
    ...buildGoogleAdsLoginVerifiedStamp(params.customerId),
    availableAccounts: params.availableAccounts,
  });
  return { ok: true };
}

async function selectAndPersistAdsAccount(params: {
  shop: string;
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  customerId: string;
  accounts: PendingOAuthAccount[];
}): Promise<
  { ok: true; loginCustomerId: string } | { ok: false; error: string; status: number }
> {
  const selected = params.accounts.find((a) => a.id === params.customerId);
  if (!selected) {
    return { ok: false, error: "customerId 不在授权账号列表中", status: 400 };
  }

  const loginCustomerId = await resolveLoginCustomerIdForAccount({
    accessToken: params.accessToken,
    customerId: params.customerId,
    preferredLogin: selected.loginCustomerId,
    accounts: params.accounts,
  });

  const persisted = await persistVerifiedAdsAccountSelection({
    shop: params.shop,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    customerId: params.customerId,
    loginCustomerId,
    availableAccounts: params.accounts,
  });
  if (!persisted.ok) {
    return persisted;
  }
  return { ok: true, loginCustomerId };
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

    const selected = await selectAndPersistAdsAccount({
      shop: session.shop,
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      customerId,
      accounts: pending.accounts,
    });
    if (!selected.ok) {
      return Response.json({ ok: false, error: selected.error }, { status: selected.status });
    }
    await clearGoogleAdsPending(session.shop);

    return Response.json({ ok: true, customerId, loginCustomerId: selected.loginCustomerId });
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

  let accounts = cred.availableAccounts?.length
    ? cred.availableAccounts
    : await resolveGoogleAdsAccounts(session.shop);

  const accessToken = (await maybeRefreshGoogleAdsToken(session.shop)) ?? cred.accessToken;
  let selected = await selectAndPersistAdsAccount({
    shop: session.shop,
    accessToken,
    refreshToken: cred.refreshToken,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    customerId,
    accounts,
  });

  if (!selected.ok && selected.status === 409) {
    const freshAccounts = await fetchFreshGoogleAdsAccounts(session.shop);
    if (freshAccounts.some((a) => a.id === customerId)) {
      accounts = freshAccounts;
      selected = await selectAndPersistAdsAccount({
        shop: session.shop,
        accessToken,
        refreshToken: cred.refreshToken,
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        customerId,
        accounts: freshAccounts,
      });
    }
  }

  if (!selected.ok) {
    return Response.json({ ok: false, error: selected.error }, { status: selected.status });
  }

  return Response.json({ ok: true, customerId, loginCustomerId: selected.loginCustomerId });
};
