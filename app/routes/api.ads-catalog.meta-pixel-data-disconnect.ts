import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteMetaPixelDataManualCredential } from "../server/adsCatalog/credentialStore.server";

/** 断开 Meta Pixel 数据页手动 OAuth 测试凭证。 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  await deleteMetaPixelDataManualCredential(session.shop);
  return Response.json({ ok: true });
};
