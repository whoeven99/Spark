import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getGoogleAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";

/** 只读：检测 Spark Google Remarketing App Embed 是否已在当前主题启用。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const status = await getGoogleAppEmbedStatus(admin);
  return Response.json({ ok: true, ...status });
};
