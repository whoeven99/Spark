import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { data, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { parseGenerateDescriptionBody } from "../server/productImprove/generateDescriptionHttp.server";
import { logDetailedError } from "../server/productImprove/generateDescriptionLog.server";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { fetchProductDescriptionContext } from "../server/productImprove/productContextFetcher.server";
import { detectTextLanguage } from "../server/productImprove/detectTextLanguage.server";
import { enqueueProductImproveTask } from "../server/productImprove/productImproveAsync.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { getAppEntry } from "../config/appEntry.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { isBillingReturnRequest } from "../server/billing/buildBillingReturnUrl.server";
import { BILLING_PAGE_PATH } from "../server/billing/buildBillingReturnUrl.server";
import { billingErrorToResponse } from "../server/billing/index.server";
import {
  loadBillingContext,
  requireBillingAccess,
  toBillingAccessSnapshot,
} from "../server/billing/index.server";
import { createBatchWithTask } from "../server/aiTask/aiTaskStore.server";
import { listRecentTasksForShop } from "../server/aiTask/aiTaskStore.server";
import { ProductImprovePage } from "./page/ProductImprovePage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const shopLocales = await fetchShopLocalesPayload(
    admin,
    `[PageLoader] shop=${session.shop}`,
  );
  const billing = toBillingAccessSnapshot(
    await loadBillingContext(session.shop, getAppEntry()),
  );
  const recentTasks = await listRecentTasksForShop({
    shop: session.shop,
    appName: getAppEntry(),
    taskType: "product_improve",
  });
  return data({ shopLocales, billing, recentTasks });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = crypto.randomUUID();
  console.info(
    `[ProductImprove][Page Action] requestId=${requestId} method=${request.method}`,
  );

  if (request.method !== "POST") {
    return Response.json(
      { success: false as const, errorCode: 405, errorMsg: "仅支持 POST", taskId: null },
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
      { success: false as const, errorCode: 400, errorMsg: "请求体不是合法 JSON", taskId: null },
      { status: 400 },
    );
  }

  const parsed = parseGenerateDescriptionBody(raw);
  if (!parsed.ok) {
    return Response.json(
      { success: false as const, errorCode: 400, errorMsg: parsed.errorMsg, taskId: null },
      { status: 400 },
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const appName = getAppEntry();

    await requireBillingAccess(shop, appName);

    // Fetch product context synchronously (needs admin client)
    const context = await fetchProductDescriptionContext(admin, parsed.data.productId);
    if (!context) {
      return Response.json(
        { success: false as const, errorCode: 40401, errorMsg: "未找到对应商品或无权访问", taskId: null },
        { status: 404 },
      );
    }

    // Detect source language from product text
    const sourceLanguage = detectTextLanguage(context.title + " " + context.text);

    // Get shop info for brand style
    const shopInfo = await fetchShopBasicInfo(admin);
    const brandStyle = shopInfo?.name || "标准";

    const { taskId, batchId } = await createBatchWithTask({
      shop,
      appName,
      taskType: "product_improve",
      batchConfig: {
        productId: parsed.data.productId,
        targetLanguage: parsed.data.targetLanguage,
        originalTitle: context.title,
        itemCount: 1,
        sourceLanguage,
        brandStyle,
      },
      taskConfig: {
        productId: parsed.data.productId,
        targetLanguage: parsed.data.targetLanguage,
        originalTitle: context.title,
        originalText: context.text,
        itemCount: 1,
        sourceLanguage,
        brandStyle,
      },
    });

    enqueueProductImproveTask({
      taskId,
      shop,
      context,
      targetLanguage: parsed.data.targetLanguage,
      temperature: parsed.data.temperature,
    });

    return Response.json(
      { success: true as const, errorCode: 0, taskId, batchId, sourceLanguage, brandStyle },
      { status: 202 },
    );
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
        taskId: null,
      },
      { status: 500 },
    );
  }
};

export default function AppProductImprove() {
  return <ProductImprovePage />;
}

function serializeSearchWithoutTab(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete("tab");
  return params.toString();
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const isSamePath = currentUrl.pathname === nextUrl.pathname;
  const onlyTabChanged =
    isSamePath &&
    serializeSearchWithoutTab(currentUrl) === serializeSearchWithoutTab(nextUrl) &&
    currentUrl.searchParams.get("tab") !== nextUrl.searchParams.get("tab");

  if (onlyTabChanged) {
    return false;
  }

  return defaultShouldRevalidate;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
