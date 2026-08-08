/**
 * App Proxy 端点：供店面前台 Theme Extension JS 查询图片替换映射。
 * 店面访问 URL：https://{shop}.myshopify.com/a/{subpath}
 * subpath 由各 app toml 配置：test → ciwi-spark，spark-zz → ciwi-spark-zz。
 * Shopify 将请求代理至此路由，并附加 HMAC 签名供鉴权。
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listImageMappingsByShopAndLanguage } from "../server/imageMapping/imageMappingStore.server";

const LOG_PREFIX = "[ImageProxy]";

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();
  const language = url.searchParams.get("language")?.trim();

  console.info(
    `${LOG_PREFIX} incoming ${request.method} ${url.pathname} shop=${shop ?? "-"} language=${language ?? "-"}`,
  );

  try {
    await authenticate.public.appProxy(request);
  } catch (e) {
    const status = isResponse(e) ? e.status : 500;
    const detail = e instanceof Error ? e.message : "app proxy auth failed";
    console.error(`${LOG_PREFIX} auth failed status=${status} shop=${shop ?? "-"}`, e);
    return Response.json({ ok: false, error: detail }, { status: status === 401 ? 401 : 403 });
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
