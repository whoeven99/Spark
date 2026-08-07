import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaAdsPending,
  getMetaAdsCredential,
  getMetaAdsPending,
  setMetaAdsCredential,
  type PendingOAuthAccount,
} from "../server/adsCatalog/credentialStore.server";
import { getMetaAdAccounts } from "../server/adsCatalog/metaOAuth.server";

function mapMetaAccounts(
  accounts: Awaited<ReturnType<typeof getMetaAdAccounts>>,
): PendingOAuthAccount[] {
  return accounts.map((a) => ({
    id: a.adAccountId,
    name: a.name,
    formatted: a.currencyCode,
  }));
}

async function resolveMetaAdsAccounts(shop: string): Promise<PendingOAuthAccount[]> {
  const pending = await getMetaAdsPending(shop);
  if (pending?.accounts.length) {
    return pending.accounts;
  }

  const cred = await getMetaAdsCredential(shop);
  if (!cred) return [];

  if (cred.availableAccounts?.length) {
    return cred.availableAccounts;
  }

  const fresh = await getMetaAdAccounts(cred.accessToken);
  const accounts = mapMetaAccounts(fresh);
  if (accounts.length > 0) {
    const stillValid = accounts.some((a) => a.id === cred.adAccountId);
    const selected = stillValid
      ? accounts.find((a) => a.id === cred.adAccountId)!
      : accounts[0];
    await setMetaAdsCredential(shop, {
      accessToken: cred.accessToken,
      adAccountId: selected.id,
      adAccountName: stillValid ? cred.adAccountName : selected.name,
      currencyCode: stillValid ? cred.currencyCode : selected.formatted,
      availableAccounts: accounts,
    });
  }
  return accounts;
}

/**
 * GET/POST /api/ads-insights/meta-accounts
 * 多广告账户选择与切换。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const accounts = await resolveMetaAdsAccounts(session.shop);
  return Response.json({ ok: true, accounts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as { adAccountId?: string };
  const adAccountId = body.adAccountId?.trim();
  if (!adAccountId) {
    return Response.json({ ok: false, error: "adAccountId is required" }, { status: 400 });
  }

  const pending = await getMetaAdsPending(session.shop);
  if (pending) {
    const selected = pending.accounts.find((a) => a.id === adAccountId);
    if (!selected) {
      return Response.json({ ok: false, error: "adAccountId 不在授权列表中" }, { status: 400 });
    }

    await setMetaAdsCredential(session.shop, {
      accessToken: pending.accessToken,
      adAccountId,
      adAccountName: selected.name,
      currencyCode: selected.formatted,
      availableAccounts: pending.accounts,
    });
    await clearMetaAdsPending(session.shop);
    return Response.json({ ok: true, adAccountId });
  }

  const cred = await getMetaAdsCredential(session.shop);
  if (!cred) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新连接 Meta Ads" },
      { status: 409 },
    );
  }

  const accounts = cred.availableAccounts?.length
    ? cred.availableAccounts
    : mapMetaAccounts(await getMetaAdAccounts(cred.accessToken));
  const selected = accounts.find((a) => a.id === adAccountId);
  if (!selected) {
    return Response.json({ ok: false, error: "adAccountId 不在授权列表中" }, { status: 400 });
  }

  await setMetaAdsCredential(session.shop, {
    accessToken: cred.accessToken,
    adAccountId,
    adAccountName: selected.name,
    currencyCode: selected.formatted,
    availableAccounts: accounts,
  });

  return Response.json({ ok: true, adAccountId });
};
