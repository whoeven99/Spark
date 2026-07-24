import type { LoaderFunctionArgs } from "react-router";
import type {
  ContextResourceListResponse,
  ContextResourceSortDirection,
  ContextResourceType,
} from "../lib/contextResourceTypes";
import { authenticate } from "../shopify.server";
import { searchContextResources } from "../server/shopify/contextResourceSearch.server";

const MAX_QUERY_LENGTH = 120;

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> => {
  const type = params.type;
  if (!isContextResourceType(type)) {
    return json(
      {
        success: false,
        errorMsg: "不支持的资源类型",
        response: null,
      },
      400,
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const filter = url.searchParams.get("filter")?.trim() ?? "";
  const sort = url.searchParams.get("sort")?.trim() ?? "";
  const direction = coerceDirection(url.searchParams.get("direction"));
  const cursor = url.searchParams.get("cursor")?.trim() ?? "";
  const limit = coerceLimit(url.searchParams.get("limit"));

  if (query.length > MAX_QUERY_LENGTH) {
    return json(
      {
        success: false,
        errorMsg: `搜索词过长（最多 ${MAX_QUERY_LENGTH} 个字符）`,
        response: null,
      },
      400,
    );
  }

  try {
    const { admin } = await authenticate.admin(request);
    const result = await searchContextResources(admin, type, {
      query,
      filter,
      sort,
      direction,
      cursor,
      limit,
    });
    return json(
      {
        success: true,
        errorMsg: "",
        response: result,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源查询失败";
    return json(
      {
        success: false,
        errorMsg: message,
        response: null,
      },
      200,
    );
  }
};

function json(body: ContextResourceListResponse, status: number) {
  return Response.json(body, { status });
}

function isContextResourceType(value: string | undefined): value is ContextResourceType {
  return value === "product" || value === "article" || value === "order";
}

function coerceDirection(value: string | null): ContextResourceSortDirection {
  return value === "asc" ? "asc" : "desc";
}

function coerceLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}
