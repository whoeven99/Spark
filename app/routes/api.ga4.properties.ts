import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGa4Pending,
  getGa4Pending,
  setGa4Credential,
} from "../server/googleAnalytics/ga4Credentials.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as { propertyId?: string };
  if (!body.propertyId) {
    return Response.json({ ok: false, error: "propertyId 必填" }, { status: 400 });
  }

  const pending = await getGa4Pending(session.shop);
  if (!pending) {
    return Response.json({ ok: false, error: "未找到待确认的 GA4 授权" }, { status: 400 });
  }

  const chosen = pending.properties.find((p) => p.propertyId === body.propertyId);
  if (!chosen) {
    return Response.json({ ok: false, error: "所选属性不在授权列表中" }, { status: 400 });
  }

  await setGa4Credential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    propertyId: chosen.propertyId,
    propertyName: chosen.propertyName,
  });
  await clearGa4Pending(session.shop);

  return Response.json({ ok: true, propertyId: chosen.propertyId, propertyName: chosen.propertyName });
};
