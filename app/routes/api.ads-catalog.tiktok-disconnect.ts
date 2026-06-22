import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearTiktokCatalogPending,
  deleteTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await Promise.all([
      deleteTiktokCatalogCredential(shop),
      clearTiktokCatalogPending(shop),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Disconnect failed" },
      { status: 500 },
    );
  }
};
