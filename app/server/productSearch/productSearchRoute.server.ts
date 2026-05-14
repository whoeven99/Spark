import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { searchProducts } from "../shopify/productSearch.server";
import type { ProductSearchApiResponse } from "../../lib/productSearchTypes";

const MAX_KEYWORD_LEN = 120;

function json(body: ProductSearchApiResponse, status: number): Response {
  return Response.json(body, { status });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q")?.trim() ?? "";
  const shopParam = url.searchParams.get("shop")?.trim();

  if (rawQ.length > MAX_KEYWORD_LEN) {
    return json(
      {
        success: false,
        errorCode: 400,
        errorMsg: `搜索词过长（最多 ${MAX_KEYWORD_LEN} 个字符）`,
        response: null,
      },
      400,
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);

    if (shopParam && shopParam !== session.shop) {
      return json(
        {
          success: false,
          errorCode: 403,
          errorMsg: "shop 与当前会话店铺不一致",
          response: null,
        },
        403,
      );
    }

    if (!rawQ) {
      return json(
        {
          success: true,
          errorCode: 0,
          errorMsg: "",
          response: { products: [] },
        },
        200,
      );
    }

    const products = await searchProducts(admin, rawQ, { first: 25 });
    return json(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: { products },
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求处理失败";
    return json(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      500,
    );
  }
};
