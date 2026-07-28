import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGa4Pending,
  deleteGa4Credential,
} from "../server/googleAnalytics/ga4Credentials.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await deleteGa4Credential(session.shop);
  await clearGa4Pending(session.shop);
  return Response.json({ ok: true });
};
