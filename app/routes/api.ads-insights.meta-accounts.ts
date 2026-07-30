import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaAdsPending,
  getMetaAdsPending,
  setMetaAdsCredential,
} from "../server/adsCatalog/credentialStore.server";

/**
 * GET/POST /api/ads-insights/meta-accounts
 * 多广告账户选择。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getMetaAdsPending(session.shop);
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
  const body = (await request.json().catch(() => ({}))) as { adAccountId?: string };
  const adAccountId = body.adAccountId?.trim();
  if (!adAccountId) {
    return Response.json({ ok: false, error: "adAccountId is required" }, { status: 400 });
  }

  const pending = await getMetaAdsPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新连接 Meta Ads" },
      { status: 409 },
    );
  }
  const selected = pending.accounts.find((a) => a.id === adAccountId);
  if (!selected) {
    return Response.json({ ok: false, error: "adAccountId 不在授权列表中" }, { status: 400 });
  }

  await setMetaAdsCredential(session.shop, {
    accessToken: pending.accessToken,
    adAccountId,
    adAccountName: selected.name,
    currencyCode: selected.formatted,
  });
  await clearMetaAdsPending(session.shop);

  return Response.json({ ok: true, adAccountId });
};
