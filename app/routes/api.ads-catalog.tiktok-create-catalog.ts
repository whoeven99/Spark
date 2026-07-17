import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearTiktokCatalogPending,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { createTiktokCatalog } from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { listAccessibleBcIds } from "../server/adsCatalog/tiktokOAuth.server";

/**
 * Path B：无官方 Shopify Catalog 时，由 Spark 新建可写 Catalog 并绑定凭证。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const pending = await getTiktokCatalogPending(shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "No pending TikTok authorization found. Please re-authorize." },
      { status: 400 },
    );
  }

  const advertiserId =
    pending.advertiserId?.trim() ||
    pending.accounts.find((a) => a.advertiserId?.trim())?.advertiserId?.trim() ||
    "";
  if (!advertiserId) {
    return Response.json(
      { ok: false, error: "缺少 advertiserId，请重新授权 TikTok。" },
      { status: 400 },
    );
  }

  let bcId = pending.bcId?.trim() || "";
  if (!bcId) {
    try {
      const bcIds = await listAccessibleBcIds({ accessToken: pending.accessToken });
      bcId = bcIds[0] ?? "";
    } catch {
      bcId = "";
    }
  }
  if (!bcId) {
    return Response.json(
      { ok: false, error: "缺少 bc_id，请重新授权 TikTok。" },
      { status: 400 },
    );
  }

  try {
    const shopInfo = await fetchShopBasicInfo(admin);
    const shopLabel = (shopInfo?.name || shop.split(".")[0] || "Store").slice(0, 40);
    const created = await createTiktokCatalog({
      accessToken: pending.accessToken,
      bcId,
      name: `Spark Catalog — ${shopLabel}`,
      currency: shopInfo?.currencyCode,
    });

    await clearTiktokCatalogPending(shop);
    await setTiktokCatalogCredential(shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      advertiserId,
      bcId,
      catalogId: created.catalogId,
      catalogName: created.catalogName,
      bindingMode: "api_managed",
    });

    return Response.json({
      ok: true,
      catalogId: created.catalogId,
      catalogName: created.catalogName,
      bindingMode: "api_managed",
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to create TikTok catalog",
      },
      { status: 500 },
    );
  }
};
