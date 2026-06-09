import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { listShopifyObjects } from "./shopifyObjectList.server";
import type {
  ShopifyObjectKind,
  ShopifyObjectListApiResponse,
  ShopifyObjectSort,
  ShopifyObjectStatusFilter,
} from "../../lib/shopifyObjectTypes";

const MAX_KEYWORD_LEN = 120;

function json(body: ShopifyObjectListApiResponse, status: number): Response {
  return Response.json(body, { status });
}

function parseKind(value: string | null): ShopifyObjectKind | null {
  if (value === "product" || value === "article") return value;
  return null;
}

function parseStatusFilter(value: string | null): ShopifyObjectStatusFilter {
  if (
    value === "active" ||
    value === "draft" ||
    value === "archived" ||
    value === "published"
  ) {
    return value;
  }
  return "all";
}

function parseSort(value: string | null): ShopifyObjectSort {
  if (value === "title_asc") return "title_asc";
  return "updated_desc";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const rawQ = url.searchParams.get("q")?.trim() ?? "";
  const statusFilter = parseStatusFilter(url.searchParams.get("status"));
  const sort = parseSort(url.searchParams.get("sort"));
  const after = url.searchParams.get("after")?.trim() || null;
  const shopParam = url.searchParams.get("shop")?.trim();

  if (!kind) {
    return json(
      {
        success: false,
        errorCode: 400,
        errorMsg: "kind 必须为 product 或 article",
        response: null,
      },
      400,
    );
  }

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

    const result = await listShopifyObjects(admin, kind, {
      keyword: rawQ,
      statusFilter,
      sort,
      after,
      first: 20,
    });

    return json(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: result,
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
