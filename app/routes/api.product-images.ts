/**
 * GET /api/product-images?id=<productGid>
 * 返回商品图片列表，供 TaskProposal 图片翻译选图。
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchProductImages } from "../server/shopify/productImages.server";

type ProductImagesApiResponse =
  | {
      success: true;
      errorCode: number;
      errorMsg: string;
      response: {
        id: string;
        title: string;
        featuredImageUrl: string | null;
        images: Array<{ url: string; altText: string | null }>;
      };
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      response: null;
    };

function json(body: ProductImagesApiResponse, status: number): Response {
  return Response.json(body, { status });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("id")?.trim() ?? "";
  const shopParam = url.searchParams.get("shop")?.trim();

  if (!productId) {
    return json(
      {
        success: false,
        errorCode: 400,
        errorMsg: "缺少商品 id",
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

    const product = await fetchProductImages(admin, productId);
    if (!product) {
      return json(
        {
          success: false,
          errorCode: 404,
          errorMsg: "商品不存在或无法访问",
          response: null,
        },
        404,
      );
    }

    return json(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: product,
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
