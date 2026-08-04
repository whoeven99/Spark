import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  bindTiktokCatalogForShop,
  listTiktokCatalogsForShop,
} from "../server/adsCatalog/tiktokListCatalogs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const credential = await getTiktokCatalogCredential(shop);
  const pending = await getTiktokCatalogPending(shop);
  if (!credential && !pending) {
    return Response.json(
      { ok: false, error: "请先完成 TikTok 授权" },
      { status: 400 },
    );
  }

  try {
    const catalogs = await listTiktokCatalogsForShop(shop);
    return Response.json({
      ok: true,
      catalogs,
      boundCatalogId: credential?.catalogId ?? "",
      bindingMode: credential?.bindingMode ?? "",
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to list TikTok catalogs" },
      { status: 500 },
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let body: { catalogId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const catalogId = String(body.catalogId ?? "").trim();
  if (!catalogId) {
    return Response.json({ ok: false, error: "catalogId is required" }, { status: 400 });
  }

  try {
    const result = await bindTiktokCatalogForShop(shop, catalogId);
    return Response.json({
      ok: true,
      catalogId: result.catalogId,
      catalogName: result.catalogName,
      bindingMode: result.bindingMode,
      unchanged: result.unchanged === true,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save credential" },
      { status: 500 },
    );
  }
};
