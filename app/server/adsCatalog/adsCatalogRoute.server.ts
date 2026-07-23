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
import { getTiktokCatalogCredential } from "./credentialStore.server";
import { preflightTiktokCatalogSync } from "./tiktokCatalogPreflight.server";
import { fetchProductsForCatalog } from "./productFetcher.server";

const TASK_TYPE: AITaskType = "ads_catalog_sync";

const SyncRequestSchema = z.object({
  platform: z.enum(["facebook", "google", "tiktok"]),
  productIds: z.array(z.string().min(1)).max(250).optional().nullable(),
  contentLanguage: z.string().min(2).max(8).optional(),
  targetCountry: z.string().min(2).max(4).optional(),
  googleProductCategory: z.string().max(64).optional(),
  tiktokUploadMethod: z.enum(["product_upload", "product_file"]).optional(),
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
      platform: "facebook" | "google" | "tiktok";
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

  try {
    return await handleAdsCatalogSyncActionInner(request, parsed.data);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Sync failed";
    console.error(`[AdsCatalog][Sync] unhandled ${errorMsg}`);
    return Response.json(
      { success: false, errorCode: 500, errorMsg },
      { status: 500 },
    );
  }
}

async function handleAdsCatalogSyncActionInner(
  request: Request,
  parsed: z.infer<typeof SyncRequestSchema>,
): Promise<Response> {
  const { admin, session } = await authenticate.admin(request);
  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  initI18n(locale);

  const productIds =
    parsed.productIds && parsed.productIds.length > 0
      ? parsed.productIds
      : null;
  const filters = parsed.filters ?? {};
  const tiktokUploadMethod =
    parsed.platform === "tiktok"
      ? (parsed.tiktokUploadMethod ?? "product_upload")
      : undefined;
  const maxProducts =
    parsed.platform === "tiktok" && tiktokUploadMethod === "product_file" ? 2000 : 250;

  const [shopInfo, products] = await Promise.all([
    fetchShopBasicInfo(admin),
    fetchProductsForCatalog(admin, {
      productIds,
      tags: filters.tags,
      productTypes: filters.productTypes,
      vendors: filters.vendors,
      inStockOnly: filters.inStockOnly,
      maxProducts,
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

  if (parsed.platform === "tiktok") {
    const preflight = await preflightTiktokCatalogSync({
      shop: session.shop,
      admin,
      uploadMethod: tiktokUploadMethod,
    });
    if (!preflight.canSync) {
      return Response.json(
        {
          success: false,
          errorCode: 400,
          errorMsg: preflight.error ?? "TikTok catalog preflight failed",
        },
        { status: 400 },
      );
    }
  }

  const tiktokBindingMode =
    parsed.platform === "tiktok"
      ? (await getTiktokCatalogCredential(session.shop))?.bindingMode
      : undefined;

  const { taskId, batchId } = await createBatchWithTask({
    shop: session.shop,
    taskType: TASK_TYPE,
    batchConfig: {
      platform: parsed.platform,
      productIds,
      totalProducts: products.length,
      ...(tiktokBindingMode ? { bindingMode: tiktokBindingMode } : {}),
      ...(tiktokUploadMethod ? { tiktokUploadMethod } : {}),
    },
    taskConfig: {
      platform: parsed.platform,
      productIds,
      totalProducts: products.length,
      ...(tiktokBindingMode ? { bindingMode: tiktokBindingMode } : {}),
      ...(tiktokUploadMethod ? { tiktokUploadMethod } : {}),
    },
  });

  const enqueueParams: EnqueueAdsCatalogSyncParams = {
    taskId,
    shop: session.shop,
    shopDomain,
    defaultCurrency,
    brand,
    locale,
    platform: parsed.platform,
    products,
    googleContentLanguage: parsed.contentLanguage,
    googleTargetCountry: parsed.targetCountry,
    googleProductCategory: parsed.googleProductCategory,
    ...(tiktokUploadMethod ? { tiktokUploadMethod } : {}),
  };
  enqueueAdsCatalogSync(enqueueParams);

  const response: AdsCatalogSyncResponse = {
    success: true,
    taskId,
    batchId,
    platform: parsed.platform,
    productCount: products.length,
  };
  return Response.json(response, { status: 202 });
}
