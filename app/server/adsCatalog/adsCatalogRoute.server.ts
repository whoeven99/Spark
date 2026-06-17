import { z } from "zod";
import { authenticate } from "../../shopify.server";
import { createBatchWithTask } from "../aiTask/aiTaskStore.server";
import type { AITaskType } from "../../lib/aiTaskTypes";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import { detectRequestLocale, readShopifySessionLocale } from "../../i18n/detector.server";
import { initI18n } from "../../i18n";
import {
  enqueueAdsCatalogSync,
  type EnqueueAdsCatalogSyncParams,
} from "./adsCatalogAsync.server";
import { fetchProductsForCatalog } from "./productFetcher.server";

const TASK_TYPE: AITaskType = "ads_catalog_sync";

const SyncRequestSchema = z.object({
  platform: z.enum(["facebook", "google"]),
  productIds: z.array(z.string().min(1)).max(250).optional().nullable(),
  contentLanguage: z.string().min(2).max(8).optional(),
  targetCountry: z.string().min(2).max(4).optional(),
  googleProductCategory: z.string().max(64).optional(),
  filters: z
    .object({
      tags: z.array(z.string()).optional(),
      productTypes: z.array(z.string()).optional(),
      vendors: z.array(z.string()).optional(),
      inStockOnly: z.boolean().optional(),
    })
    .optional(),
});

export type AdsCatalogSyncResponse =
  | {
      success: true;
      taskId: string;
      batchId: string;
      platform: "facebook" | "google";
      productCount: number;
    }
  | { success: false; errorCode: number; errorMsg: string };

export async function handleAdsCatalogSyncAction(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json(
      { success: false, errorCode: 405, errorMsg: "Method not allowed" },
      { status: 405 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { success: false, errorCode: 400, errorMsg: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = SyncRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        errorCode: 400,
        errorMsg: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }

  const { admin, session } = await authenticate.admin(request);
  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  initI18n(locale);

  const productIds =
    parsed.data.productIds && parsed.data.productIds.length > 0
      ? parsed.data.productIds
      : null;
  const filters = parsed.data.filters ?? {};

  const [shopInfo, products] = await Promise.all([
    fetchShopBasicInfo(admin),
    fetchProductsForCatalog(admin, {
      productIds,
      tags: filters.tags,
      productTypes: filters.productTypes,
      vendors: filters.vendors,
      inStockOnly: filters.inStockOnly,
      maxProducts: 250,
    }),
  ]);

  if (products.length === 0) {
    return Response.json(
      {
        success: false,
        errorCode: 404,
        errorMsg: "No active products available to sync.",
      },
      { status: 404 },
    );
  }

  const shopDomain =
    shopInfo?.primaryDomainHost ?? shopInfo?.myshopifyDomain ?? session.shop;
  const brand = shopInfo?.name ?? undefined;
  const defaultCurrency = shopInfo?.currencyCode ?? undefined;

  const { taskId, batchId } = await createBatchWithTask({
    shop: session.shop,
    taskType: TASK_TYPE,
    batchConfig: {
      platform: parsed.data.platform,
      productIds,
      totalProducts: products.length,
    },
    taskConfig: {
      platform: parsed.data.platform,
      productIds,
      totalProducts: products.length,
    },
  });

  const enqueueParams: EnqueueAdsCatalogSyncParams = {
    taskId,
    shop: session.shop,
    shopDomain,
    defaultCurrency,
    brand,
    locale,
    platform: parsed.data.platform,
    products,
    googleContentLanguage: parsed.data.contentLanguage,
    googleTargetCountry: parsed.data.targetCountry,
    googleProductCategory: parsed.data.googleProductCategory,
  };
  enqueueAdsCatalogSync(enqueueParams);

  const response: AdsCatalogSyncResponse = {
    success: true,
    taskId,
    batchId,
    platform: parsed.data.platform,
    productCount: products.length,
  };
  return Response.json(response, { status: 202 });
}
