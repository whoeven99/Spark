/**
 * App Proxy 端点：供店面前台 Theme Extension JS 查询图片替换映射。
 * 店面访问 URL：https://{shop}.myshopify.com/a/ciwi-spark
 * Shopify 将请求代理至此路由，并附加 HMAC 签名供鉴权。
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listImageMappingsByShopAndLanguage } from "../server/imageMapping/imageMappingStore.server";

const LOG_PREFIX = "[ImageProxy]";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();
  const language = url.searchParams.get("language")?.trim();

  console.info(
    `${LOG_PREFIX} incoming shop=${shop ?? "-"} language=${language ?? "-"} path=${url.pathname}`,
  );

  // 验证 Shopify App Proxy HMAC 签名
  try {
    await authenticate.public.appProxy(request);
  } catch (e) {
    const status = e instanceof Response ? e.status : 500;
    console.error(`${LOG_PREFIX} appProxy auth failed status=${status} shop=${shop}`, e);
    return Response.json(
      { ok: false, error: "app proxy authentication failed" },
      { status: status === 400 ? 400 : 401 },
    );
  }

  if (!shop || !language) {
    console.warn(`${LOG_PREFIX} missing params shop=${shop} language=${language}`);
    return Response.json(
      { ok: false, error: "missing shop or language" },
      { status: 400 },
    );
  }

  try {
    const mappings = await listImageMappingsByShopAndLanguage({
      shop,
      targetCode: language,
    });

    console.info(
      `${LOG_PREFIX} ok shop=${shop} language=${language} count=${mappings.length}`,
    );

    return Response.json(
      { ok: true, mappings },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} error shop=${shop}`, e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
