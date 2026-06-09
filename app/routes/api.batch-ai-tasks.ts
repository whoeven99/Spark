/**
 * POST /api/batch-ai-tasks
 *
 * 批量创建 AI 任务（商品描述生成 或 图片翻译）。
 * 每条记录独立创建，部分失败不影响其余条目。
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { requireBillingAccess } from "../server/billing/index.server";
import { requireVisualToolBillingAccess } from "../server/tokenUsage/index.server";
import { fetchProductDescriptionContext } from "../server/productImprove/productContextFetcher.server";
import { detectTextLanguage } from "../server/productImprove/detectTextLanguage.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { getEstimatedCredits } from "../server/aiTask/aiTaskEstimation.server";
import { deriveBucket } from "../server/aiTask/estimationBucket";
import { createBatchWithTask } from "../server/aiTask/aiTaskStore.server";
import { enqueueProductImproveTask } from "../server/productImprove/productImproveAsync.server";
import { enqueuePictureTranslateTask } from "../server/pictureTranslate/pictureTranslateAsync.server";
import { detectRequestLocale, readShopifySessionLocale } from "../i18n/detector.server";
import { initI18n } from "../i18n";

const MAX_BATCH = 20;

// ─── Request schemas ──────────────────────────────────────────────────────────

const productImproveSchema = z.object({
  taskType: z.literal("product_improve"),
  targetLanguage: z.string().min(1, "targetLanguage 必填"),
  productIds: z
    .array(z.string().min(1))
    .min(1, "至少选择 1 个商品")
    .max(MAX_BATCH, `最多批量创建 ${MAX_BATCH} 个任务`),
});

const pictureTranslateSchema = z.object({
  taskType: z.literal("picture_translate"),
  sourceCode: z.string().min(1, "sourceCode 必填"),
  targetCode: z.string().min(1, "targetCode 必填"),
  modelType: z.union([z.literal(1), z.literal(2)]),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        imageUrl: z
          .string()
          .min(1, "imageUrl 必填")
          .refine((u) => /^https:\/\//i.test(u), "imageUrl 必须为 HTTPS"),
      }),
    )
    .min(1, "至少选择 1 个商品")
    .max(MAX_BATCH, `最多批量创建 ${MAX_BATCH} 个任务`),
});

const batchRequestSchema = z.discriminatedUnion("taskType", [
  productImproveSchema,
  pictureTranslateSchema,
]);

// ─── Response types ───────────────────────────────────────────────────────────

export type BatchTaskError = {
  index: number;
  productId: string;
  error: string;
};

export type BatchAITasksResponse =
  | {
      ok: true;
      created: number;
      taskIds: string[];
      errors: BatchTaskError[];
    }
  | { ok: false; error: string };

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data<BatchAITasksResponse>(
      { ok: false, error: "Method not allowed" },
      { status: 405 },
    );
  }

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  const i18n = initI18n(locale);
  const t = i18n.t.bind(i18n);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return data<BatchAITasksResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("；");
    return data<BatchAITasksResponse>({ ok: false, error: msg }, { status: 400 });
  }

  const body = parsed.data;

  // ── 商品描述生成 ──────────────────────────────────────────────────────────
  if (body.taskType === "product_improve") {
    try {
      await requireBillingAccess(shop);
    } catch {
      return data<BatchAITasksResponse>(
        { ok: false, error: t("billing.lowBalanceWarning") },
        { status: 402 },
      );
    }

    const shopInfo = await fetchShopBasicInfo(admin).catch(() => null);
    const brandStyle = shopInfo?.name || t("productImproveStage1.defaultBrandStyle");

    const taskIds: string[] = [];
    const errors: BatchTaskError[] = [];

    for (let i = 0; i < body.productIds.length; i++) {
      const productId = body.productIds[i];
      try {
        const context = await fetchProductDescriptionContext(admin, productId);
        if (!context) {
          errors.push({ index: i, productId, error: t("productImproveStage1.serverProductNotFound") });
          continue;
        }
        const sourceLanguage = detectTextLanguage(context.title + " " + context.text);
        const bucket = deriveBucket("product_improve", {
          originalTitle: context.title,
          originalText: context.text,
        });
        const { taskId, batchId: _batchId } = await createBatchWithTask({
          shop,
          taskType: "product_improve",
          batchConfig: {
            productId,
            targetLanguage: body.targetLanguage,
            originalTitle: context.title,
            itemCount: 1,
            sourceLanguage,
            brandStyle,
          },
          taskConfig: {
            productId,
            targetLanguage: body.targetLanguage,
            originalTitle: context.title,
            originalText: context.text,
            itemCount: 1,
            sourceLanguage,
            brandStyle,
          },
          estimatedCredits: await getEstimatedCredits("product_improve", bucket),
        });
        enqueueProductImproveTask({ taskId, shop, locale, context, targetLanguage: body.targetLanguage });
        taskIds.push(taskId);
      } catch (e) {
        errors.push({
          index: i,
          productId,
          error: e instanceof Error ? e.message : "创建失败",
        });
      }
    }

    return data<BatchAITasksResponse>({
      ok: true,
      created: taskIds.length,
      taskIds,
      errors,
    });
  }

  // ── 图片翻译 ──────────────────────────────────────────────────────────────
  try {
    await requireVisualToolBillingAccess(shop);
  } catch {
    return data<BatchAITasksResponse>(
      { ok: false, error: t("billing.lowBalanceWarning") },
      { status: 402 },
    );
  }

  const { sourceCode, targetCode, modelType } = body;

  const ewmaCredits = await getEstimatedCredits(
    "picture_translate",
    deriveBucket("picture_translate", { modelType }),
  );
  const taskIds: string[] = [];
  const errors: BatchTaskError[] = [];

  // zh-TW → zh-Hant for Volcano engine (model 2)
  const effectiveTargetCode =
    modelType === 2 && targetCode === "zh-TW" ? "zh-Hant" : targetCode;

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    try {
      const { taskId } = await createBatchWithTask({
        shop,
        taskType: "picture_translate",
        batchConfig: {
          imageUrl: item.imageUrl,
          sourceCode,
          targetCode: effectiveTargetCode,
          modelType,
        },
        taskConfig: {
          imageUrl: item.imageUrl,
          sourceCode,
          targetCode: effectiveTargetCode,
          modelType,
        },
        estimatedCredits: ewmaCredits,
      });
      enqueuePictureTranslateTask({
        taskId,
        shop,
        imageUrl: item.imageUrl,
        sourceCode,
        targetCode: effectiveTargetCode,
        modelType,
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

  return data<BatchAITasksResponse>({
    ok: true,
    created: taskIds.length,
    taskIds,
    errors,
  });
};
