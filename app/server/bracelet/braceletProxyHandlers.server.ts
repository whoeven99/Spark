import { renderBraceletConfiguratorPage } from "./braceletPageHtml.server";
import {
  prepareBraceletCart,
  validatePrepareBraceletInput,
} from "./prepareBraceletCart.server";
import { authenticate } from "../../shopify.server";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** App Proxy 定制页（GET） */
export async function braceletProxyPageLoader(
  request: Request,
  preparePath: string,
): Promise<Response> {
  await authenticate.public.appProxy(request);

  const html = renderBraceletConfiguratorPage({ preparePath });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** App Proxy 加购准备（POST） */
export async function braceletProxyPrepareAction(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const context = await authenticate.public.appProxy(request);
  if (!context.session?.shop || !context.admin) {
    return json(
      {
        ok: false,
        error: "店铺未安装应用或 session 无效，请从 Shopify 后台打开应用并完成授权。",
      },
      401,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const validated = validatePrepareBraceletInput(body);
  if (!validated.ok) {
    return json({ ok: false, error: validated.error }, validated.status);
  }

  const result = await prepareBraceletCart({
    admin: context.admin,
    shop: context.session.shop,
    input: validated.input,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status);
  }

  return json(result, 200);
}
