/**
 * 批量 AI 任务创建的共享实现。
 * 由 /api/batch-ai-tasks（旧批量卡片）与 /api/task-proposal（通用确认卡片）共用，
 * 保证两条入口创建出的任务完全一致。
 *
 * 注意：计费校验（requireBillingAccess 等）由调用方负责，这里只做创建。
 */
import { fetchProductDescriptionContext } from "../productImprove/productContextFetcher.server";
import { detectTextLanguage } from "../productImprove/detectTextLanguage.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import { getEstimatedCredits } from "./aiTaskEstimation.server";
import { deriveBucket } from "./estimationBucket";
import { createBatchWithTask } from "./aiTaskStore.server";
import { enqueueProductImproveTask } from "../productImprove/productImproveAsync.server";
import { enqueuePictureTranslateTask } from "../pictureTranslate/pictureTranslateAsync.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

export type BatchCreateError = {
  index: number;
  productId: string;
  error: string;
};

export type BatchCreateResult = {
  taskIds: string[];
  errors: BatchCreateError[];
};

export async function createProductImproveBatchTasks(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  locale: string;
  targetLanguage: string;
  productIds: string[];
  /** 商品不存在时的错误文案（带 i18n 的调用方传入） */
  productNotFoundMessage: string;
  /** 店铺名兜底品牌风格文案 */
  defaultBrandStyle: string;
}): Promise<BatchCreateResult> {
  const shopInfo = await fetchShopBasicInfo(args.admin).catch(() => null);
  const brandStyle = shopInfo?.name || args.defaultBrandStyle;

  const taskIds: string[] = [];
  const errors: BatchCreateError[] = [];

  for (let i = 0; i < args.productIds.length; i++) {
    const productId = args.productIds[i];
    try {
      const context = await fetchProductDescriptionContext(args.admin, productId);
      if (!context) {
        errors.push({ index: i, productId, error: args.productNotFoundMessage });
        continue;
      }
      const sourceLanguage = detectTextLanguage(context.title + " " + context.text);
      const bucket = deriveBucket("product_improve", {
        originalTitle: context.title,
        originalText: context.text,
      });
      const { taskId } = await createBatchWithTask({
        shop: args.shop,
        taskType: "product_improve",
        batchConfig: {
          productId,
          targetLanguage: args.targetLanguage,
          originalTitle: context.title,
          itemCount: 1,
          sourceLanguage,
          brandStyle,
        },
        taskConfig: {
          productId,
          targetLanguage: args.targetLanguage,
          originalTitle: context.title,
          originalText: context.text,
          itemCount: 1,
          sourceLanguage,
          brandStyle,
        },
        estimatedCredits: await getEstimatedCredits("product_improve", bucket),
      });
      enqueueProductImproveTask({
        taskId,
        shop: args.shop,
        locale: args.locale,
        context,
        targetLanguage: args.targetLanguage,
      });
      taskIds.push(taskId);
    } catch (e) {
      errors.push({
        index: i,
        productId,
        error: e instanceof Error ? e.message : "创建失败",
      });
    }
  }

  return { taskIds, errors };
}

export async function createPictureTranslateBatchTasks(args: {
  shop: string;
  sourceCode: string;
  targetCode: string;
  modelType: 1 | 2;
  items: Array<{ productId: string; imageUrl: string }>;
}): Promise<BatchCreateResult> {
  const ewmaCredits = await getEstimatedCredits(
    "picture_translate",
    deriveBucket("picture_translate", { modelType: args.modelType }),
  );

  // zh-TW → zh-Hant for Volcano engine (model 2)
  const effectiveTargetCode =
    args.modelType === 2 && args.targetCode === "zh-TW" ? "zh-Hant" : args.targetCode;

  const taskIds: string[] = [];
  const errors: BatchCreateError[] = [];

  for (let i = 0; i < args.items.length; i++) {
    const item = args.items[i];
    try {
      const { taskId } = await createBatchWithTask({
        shop: args.shop,
        taskType: "picture_translate",
        batchConfig: {
          imageUrl: item.imageUrl,
          sourceCode: args.sourceCode,
          targetCode: effectiveTargetCode,
          modelType: args.modelType,
        },
        taskConfig: {
          imageUrl: item.imageUrl,
          sourceCode: args.sourceCode,
          targetCode: effectiveTargetCode,
          modelType: args.modelType,
        },
        estimatedCredits: ewmaCredits,
      });
      enqueuePictureTranslateTask({
        taskId,
        shop: args.shop,
        imageUrl: item.imageUrl,
        sourceCode: args.sourceCode,
        targetCode: effectiveTargetCode,
        modelType: args.modelType,
      });
      taskIds.push(taskId);
    } catch (e) {
      errors.push({
        index: i,
        productId: item.productId,
        error: e instanceof Error ? e.message : "创建失败",
      });
    }
  }

  return { taskIds, errors };
}
