import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearTiktokCatalogPending,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";

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

  const pending = await getTiktokCatalogPending(shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "No pending TikTok authorization found. Please re-authorize." },
      { status: 400 },
    );
  }

  // pending.accounts：新格式 businessId=bc_id + advertiserId；旧格式仅 businessId=advertiserId。
  const selectedEntry = pending.accounts.find((a) => a.id === catalogId);
  const explicitAdvertiserId =
    selectedEntry?.advertiserId?.trim() ||
    pending.advertiserId?.trim() ||
    pending.accounts[0]?.advertiserId?.trim() ||
    "";
  const bcId = explicitAdvertiserId
    ? selectedEntry?.businessId?.trim() ||
      pending.bcId?.trim() ||
      pending.accounts[0]?.businessId?.trim() ||
      ""
    : "";
  const advertiserId =
    explicitAdvertiserId ||
    selectedEntry?.businessId?.trim() ||
    pending.accounts[0]?.businessId?.trim() ||
    "";

  if (!advertiserId) {
    return Response.json(
      { ok: false, error: "Cannot determine advertiserId for selected catalog." },
      { status: 400 },
    );
  }
  if (!bcId) {
    return Response.json(
      {
        ok: false,
        error: "缺少 bc_id，请重新授权 TikTok 后再选择 Catalog。",
      },
      { status: 400 },
    );
  }

  try {
    await clearTiktokCatalogPending(shop);
    await setTiktokCatalogCredential(shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      advertiserId,
      bcId,
      catalogId,
      catalogName: selectedEntry?.name,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save credential" },
      { status: 500 },
    );
  }
};
