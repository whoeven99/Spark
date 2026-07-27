import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearGscPending,
  getGscPending,
  setGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as { siteUrl?: string };
  if (!body.siteUrl) {
    return Response.json({ ok: false, error: "siteUrl 必填" }, { status: 400 });
  }

  const pending = await getGscPending(session.shop);
  if (!pending) {
    return Response.json({ ok: false, error: "未找到待确认的 Search Console 授权" }, { status: 400 });
  }

  const chosen = pending.sites.find((s) => s.siteUrl === body.siteUrl);
  if (!chosen) {
    return Response.json({ ok: false, error: "所选站点不在授权列表中" }, { status: 400 });
  }

  await setGscCredential(session.shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    siteUrl: chosen.siteUrl,
  });
  await clearGscPending(session.shop);

  return Response.json({ ok: true, siteUrl: chosen.siteUrl });
};
