import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleAdsSandboxPending,
  deleteGoogleAdsSandboxCredential,
} from "../server/adsCatalog/credentialStore.server";

/**
 * POST /api/ads-insights/google-sandbox-disconnect
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await deleteGoogleAdsSandboxCredential(session.shop);
  await clearGoogleAdsSandboxPending(session.shop);
  return Response.json({ ok: true });
};
