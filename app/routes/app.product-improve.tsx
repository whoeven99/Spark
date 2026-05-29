import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  executeGenerateDescriptionRequest,
  parseGenerateDescriptionBody,
} from "../server/productImprove/generateDescriptionHttp.server";
import { logDetailedError } from "../server/productImprove/generateDescriptionLog.server";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { getAppEntry } from "../config/appEntry.server";
import {
  billingErrorToResponse,
  loadBillingContext,
  toBillingAccessSnapshot,
} from "../server/billing/index.server";
import { ProductImprovePage } from "./page/ProductImprovePage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopLocales = await fetchShopLocalesPayload(
    admin,
    `[PageLoader] shop=${session.shop}`,
  );
  const billing = toBillingAccessSnapshot(
    await loadBillingContext(session.shop, getAppEntry()),
  );
  return data({ shopLocales, billing });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = crypto.randomUUID();
  console.info(
    `[ProductImprove][Page Action] requestId=${requestId} method=${request.method}`,
  );

  if (request.method !== "POST") {
    return Response.json(
      { success: false as const, errorCode: 405, errorMsg: "仅支持 POST", response: null },
      { status: 405 },
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch (e) {
    logDetailedError(
      `[ProductImprove][Page Action] requestId=${requestId}`,
      "request.json failed",
      e,
    );
    return Response.json(
      {
        success: false as const,
        errorCode: 400,
        errorMsg: "请求体不是合法 JSON",
        response: null,
      },
      { status: 400 },
    );
  }

  const parsed = parseGenerateDescriptionBody(raw);
  if (!parsed.ok) {
    return Response.json(
      {
        success: false as const,
        errorCode: 400,
        errorMsg: parsed.errorMsg,
        response: null,
      },
      { status: 400 },
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const { status, body } = await executeGenerateDescriptionRequest({
      requestId,
      admin,
      sessionShop: session.shop,
      parsed: parsed.data,
    });
    // 使用 Response.json：页面内 fetch 需要标准 JSON；data() 在部分 RR 配置下响应体非裸 JSON，会导致前端解析失败。
    return Response.json(body, { status });
  } catch (error) {
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      return billingResponse;
    }

    logDetailedError(
      `[ProductImprove][Page Action] requestId=${requestId}`,
      "unexpected",
      error,
    );
    return Response.json(
      {
        success: false as const,
        errorCode: 500,
        errorMsg: error instanceof Error ? error.message : "请求处理失败",
        response: null,
      },
      { status: 500 },
    );
  }
};

export default function AppProductImprove() {
  return <ProductImprovePage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
