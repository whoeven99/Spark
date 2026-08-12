import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMetaBusinessPending } from "../server/adsCatalog/credentialStore.server";
import { confirmMetaBusinessPendingSelection } from "../server/adsCatalog/metaBusinessOnboarding.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pending = await getMetaBusinessPending(session.shop);
  return Response.json({
    ok: true,
    businessId: pending?.businessId ?? "",
    catalogs:
      pending?.catalogs.map((c) => ({
        id: c.id,
        name: c.name || c.id,
      })) ?? [],
    adAccounts:
      pending?.adAccounts.map((a) => ({
        id: a.id,
        name: a.name || a.id,
        formatted: a.formatted,
      })) ?? [],
    pixels:
      pending?.pixels.map((p) => ({
        pixelId: p.id,
        pixelName: p.name || p.id,
      })) ?? [],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    catalogId?: string;
    adAccountId?: string;
    pixelId?: string;
  };

  const catalogId = body.catalogId?.trim();
  const adAccountId = body.adAccountId?.trim();
  if (!catalogId || !adAccountId) {
    return Response.json(
      { ok: false, error: "catalogId and adAccountId are required" },
      { status: 400 },
    );
  }

  try {
    await confirmMetaBusinessPendingSelection({
      shop: session.shop,
      catalogId,
      adAccountId,
      pixelId: body.pixelId?.trim(),
    });
    return Response.json({ ok: true, catalogId, adAccountId, pixelId: body.pixelId?.trim() ?? "" });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "确认失败" },
      { status: 400 },
    );
  }
};
