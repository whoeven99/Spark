import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGa4Pending,
  getGa4Pending,
  setGa4Credential,
  type Ga4PropertyRef,
} from "../server/googleAnalytics/ga4Credentials.server";

function parsePropertyIds(body: { propertyIds?: unknown; propertyId?: unknown }): string[] {
  if (Array.isArray(body.propertyIds)) {
    return body.propertyIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof body.propertyId === "string" && body.propertyId.length > 0) {
    return [body.propertyId];
  }
  return [];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as {
    propertyIds?: string[];
    propertyId?: string;
  };
  const propertyIds = parsePropertyIds(body);
  if (propertyIds.length === 0) {
    return Response.json({ ok: false, error: "请至少选择一个 GA4 属性" }, { status: 400 });
  }

  const pending = await getGa4Pending(session.shop);
  if (!pending) {
    return Response.json({ ok: false, error: "未找到待确认的 GA4 授权" }, { status: 400 });
  }

  const chosen: Ga4PropertyRef[] = [];
  for (const propertyId of propertyIds) {
    const match = pending.properties.find((property) => property.propertyId === propertyId);
    if (!match) {
      return Response.json({ ok: false, error: "所选属性不在授权列表中" }, { status: 400 });
    }
    chosen.push({
      propertyId: match.propertyId,
      propertyName: match.propertyName,
      accountName: match.accountName,
      accountId: match.accountId,
    });
  }

  await setGa4Credential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    properties: chosen,
  });
  await clearGa4Pending(session.shop);

  return Response.json({ ok: true, properties: chosen });
};
