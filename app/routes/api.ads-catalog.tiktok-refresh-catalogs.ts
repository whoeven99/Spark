import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearTiktokCatalogPending,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
  setTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  getTiktokCatalogsForAdvertisers,
  listAuthorizedAdvertiserIds,
} from "../server/adsCatalog/tiktokOAuth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const pending = await getTiktokCatalogPending(shop);
  if (!pending) {
    return Response.json(
      { ok: false, error: "No pending TikTok authorization found. Please re-authorize." },
      { status: 400 },
    );
  }

  try {
    let advertiserIds = pending.advertiserId?.trim()
      ? [pending.advertiserId.trim()]
      : pending.accounts
          .map((account) => account.advertiserId?.trim() || "")
          .filter(Boolean);
    if (advertiserIds.length === 0) {
      advertiserIds = await listAuthorizedAdvertiserIds({ accessToken: pending.accessToken });
    }
    if (advertiserIds.length === 0) {
      return Response.json(
        { ok: false, error: "该 TikTok 账号未关联任何广告主账户" },
        { status: 400 },
      );
    }

    const catalogs = await getTiktokCatalogsForAdvertisers({
      accessToken: pending.accessToken,
      advertiserIds,
    });

    if (catalogs.length === 0) {
      return Response.json({
        ok: true,
        catalogs: [],
        message: "no_catalogs",
      });
    }

    if (catalogs.length === 1) {
      await clearTiktokCatalogPending(shop);
      await setTiktokCatalogCredential(shop, {
        accessToken: pending.accessToken,
        refreshToken: pending.refreshToken,
        advertiserId: catalogs[0].advertiserId,
        bcId: catalogs[0].bcId,
        catalogId: catalogs[0].catalogId,
        catalogName: catalogs[0].catalogName,
      });
      return Response.json({
        ok: true,
        autoSelected: true,
        catalogId: catalogs[0].catalogId,
      });
    }

    await setTiktokCatalogPending(shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      advertiserId: advertiserIds[0],
      accounts: catalogs.map((catalog) => ({
        id: catalog.catalogId,
        name: catalog.catalogName,
        businessId: catalog.bcId,
        advertiserId: catalog.advertiserId,
      })),
    });
    return Response.json({
      ok: true,
      catalogs: catalogs.map((catalog) => ({
        id: catalog.catalogId,
        name: catalog.catalogName ?? catalog.catalogId,
      })),
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to refresh TikTok catalogs" },
      { status: 500 },
    );
  }
};
