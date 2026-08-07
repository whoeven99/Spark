import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGa4Pending,
  getGa4Credential,
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

  // 优先从 pending 中选，其次从已保存凭证的 allProperties 中重新选择
  const pending = await getGa4Pending(session.shop);
  const credential = pending ? null : await getGa4Credential(session.shop);

  type AvailableProp = { propertyId: string; propertyName: string; accountName?: string; accountId?: string };
  const availableProperties: AvailableProp[] | null =
    pending?.properties ??
    (credential?.allProperties && credential.allProperties.length > 0
      ? credential.allProperties
      : null);

  if (!availableProperties) {
    return Response.json({ ok: false, error: "未找到可选的 GA4 属性，请重新授权" }, { status: 400 });
  }

  const chosen: Ga4PropertyRef[] = [];
  for (const propertyId of propertyIds) {
    const match = availableProperties.find((property) => property.propertyId === propertyId);
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

  if (pending) {
    // 从 pending 中确认：写入新凭证（保留 allProperties = 全部 pending 属性）
    await setGa4Credential(session.shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      properties: chosen,
      allProperties: pending.properties,
    });
    await clearGa4Pending(session.shop);
  } else if (credential) {
    // 从已有凭证的 allProperties 重新选择：只更新 properties，保留其他字段
    await setGa4Credential(session.shop, {
      ...credential,
      properties: chosen,
    });
  }

  return Response.json({ ok: true, properties: chosen });
};
