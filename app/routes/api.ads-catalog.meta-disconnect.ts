import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearMetaCatalogPending,
  deleteFacebookCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await Promise.all([
    deleteFacebookCatalogCredential(session.shop),
    clearMetaCatalogPending(session.shop),
  ]);
  return Response.json({ ok: true });
};
