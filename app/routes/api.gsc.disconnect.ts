import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGscPending,
  deleteGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  await deleteGscCredential(session.shop);
  await clearGscPending(session.shop);
  return Response.json({ ok: true });
};
