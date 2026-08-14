import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaCapiPending,
  getFacebookCatalogCredential,
  getMetaCapiPending,
  setFacebookCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { resolveMetaCapiLoginConfigId } from "../server/adsCatalog/metaOAuth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getMetaCapiPending(session.shop);
  return Response.json({
    ok: true,
    pixels:
      pending?.accounts.map((a) => ({
        pixelId: a.id,
        pixelName: a.name || a.id,
        businessId: a.businessId,
      })) ?? [],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as { pixelId?: string };
  const pixelId = body.pixelId?.trim();
  if (!pixelId) {
    return Response.json({ ok: false, error: "pixelId is required" }, { status: 400 });
  }

  const pending = await getMetaCapiPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的 CAPI 授权会话，请重新连接 Facebook CAPI" },
      { status: 409 },
    );
  }
  const selected = pending.accounts.find((a) => a.id === pixelId);
  if (!selected) {
    return Response.json({ ok: false, error: "pixelId 不在授权列表中" }, { status: 400 });
  }

  const catalog = await getFacebookCatalogCredential(session.shop);
  if (!catalog) {
    return Response.json(
      { ok: false, error: "Meta Catalog 尚未连接，请先完成 Catalog 授权" },
      { status: 409 },
    );
  }

  await setFacebookCatalogCredential(session.shop, {
    accessToken: catalog.accessToken,
    catalogId: catalog.catalogId,
    businessId: selected.businessId || catalog.businessId,
    apiVersion: catalog.apiVersion,
    pixelId,
    capiAccessToken: pending.accessToken,
    capiTokenType: "bisu",
    capiConfigId: resolveMetaCapiLoginConfigId() ?? undefined,
    capiTokenObtainedAt: new Date().toISOString(),
    capiEnabled: true,
    testEventCode: catalog.testEventCode,
    enabledEvents: catalog.enabledEvents,
  });
  await clearMetaCapiPending(session.shop);

  return Response.json({ ok: true, pixelId });
};
