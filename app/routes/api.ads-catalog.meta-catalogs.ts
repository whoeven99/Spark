import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaCatalogPending,
  getMetaCatalogPending,
  setFacebookCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getMetaCatalogPending(session.shop);
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
  const body = (await request.json().catch(() => ({}))) as { catalogId?: string };
  const catalogId = body.catalogId?.trim();
  if (!catalogId) {
    return Response.json({ ok: false, error: "catalogId is required" }, { status: 400 });
  }

  const pending = await getMetaCatalogPending(session.shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "没有待选择的授权会话，请重新连接 Meta Catalog" },
      { status: 409 },
    );
  }
  const selected = pending.accounts.find((a) => a.id === catalogId);
  if (!selected) {
    return Response.json({ ok: false, error: "catalogId 不在授权列表中" }, { status: 400 });
  }

  await setFacebookCatalogCredential(session.shop, {
    accessToken: pending.accessToken,
    catalogId,
    businessId: selected.businessId,
  });
  await clearMetaCatalogPending(session.shop);

  return Response.json({ ok: true, catalogId });
};
