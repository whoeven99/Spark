import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { preflightTiktokCatalogSync } from "../server/adsCatalog/tiktokCatalogPreflight.server";

/** TikTok 同步前预检：校验已绑定 Catalog，不创建新目录。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const uploadMethod =
    url.searchParams.get("uploadMethod") === "product_file" ? "product_file" : "product_upload";

  const result = await preflightTiktokCatalogSync({
    shop: session.shop,
    admin,
    uploadMethod,
  });

  return Response.json(result, { status: result.canSync ? 200 : 400 });
};
