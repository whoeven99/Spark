import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaBusinessPending,
  clearMetaCatalogPending,
  clearMetaCapiPending,
  deleteFacebookCatalogCredential,
  deleteMetaAdsCredential,
} from "../server/adsCatalog/credentialStore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await Promise.all([
    deleteFacebookCatalogCredential(session.shop),
    deleteMetaAdsCredential(session.shop),
    clearMetaCatalogPending(session.shop),
    clearMetaCapiPending(session.shop),
    clearMetaBusinessPending(session.shop),
  ]);
  return Response.json({ ok: true });
};
