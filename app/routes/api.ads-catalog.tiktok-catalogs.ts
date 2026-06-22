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

  // Each pending account entry reuses `businessId` to store the advertiserId.
  const selectedEntry = pending.accounts.find((a) => a.id === catalogId);
  const advertiserId = selectedEntry?.businessId ?? pending.accounts[0]?.businessId ?? "";

  if (!advertiserId) {
    return Response.json(
      { ok: false, error: "Cannot determine advertiserId for selected catalog." },
      { status: 400 },
    );
  }

  try {
    await clearTiktokCatalogPending(shop);
    await setTiktokCatalogCredential(shop, {
      accessToken: pending.accessToken,
      advertiserId,
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
