import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGoogleAdsPending,
  clearGoogleMerchantPending,
  deleteGoogleAdsCredential,
  deleteGoogleMerchantCredential,
} from "../server/adsCatalog/credentialStore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as { target?: "gmc" | "ads" };

  if (body.target === "gmc") {
    await deleteGoogleMerchantCredential(session.shop);
    await clearGoogleMerchantPending(session.shop);
  } else if (body.target === "ads") {
    await deleteGoogleAdsCredential(session.shop);
    await clearGoogleAdsPending(session.shop);
  } else {
    return Response.json({ ok: false, error: "Unknown target" }, { status: 400 });
  }
  return Response.json({ ok: true });
};
