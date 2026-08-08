import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaAdsPending,
  deleteMetaAdsCredential,
} from "../server/adsCatalog/credentialStore.server";

/**
 * POST /api/ads-insights/meta-disconnect
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await deleteMetaAdsCredential(session.shop);
  await clearMetaAdsPending(session.shop);
  return Response.json({ ok: true });
};
