import type { LoaderFunctionArgs } from "react-router";
import { renderBraceletConfiguratorPage } from "../server/bracelet/braceletPageHtml.server";
import { authenticate } from "../shopify.server";

/** App Proxy: GET /apps/spark-bracelet → 定制手环 C 端页面 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const html = renderBraceletConfiguratorPage({
    preparePath: "/apps/spark-bracelet/prepare",
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
