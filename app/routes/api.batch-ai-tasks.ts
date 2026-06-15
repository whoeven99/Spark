/**
 * POST /api/batch-ai-tasks
 *
 * 批量创建 AI 任务（商品描述生成 或 图片翻译）。
 * 每条记录独立创建，部分失败不影响其余条目。
 * 创建逻辑在 server/aiTask/batchTaskCreate.server.ts，与 /api/task-proposal 共用。
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { requireBillingAccess } from "../server/billing/index.server";
import { requireVisualToolBillingAccess } from "../server/tokenUsage/index.server";
import {
  createPictureTranslateBatchTasks,
  createProductImproveBatchTasks,
} from "../server/aiTask/batchTaskCreate.server";
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

    const result = await createProductImproveBatchTasks({
      admin,
      shop,
      locale,
      targetLanguage: body.targetLanguage,
      productIds: body.productIds,
      productNotFoundMessage: t("productImproveStage1.serverProductNotFound"),
      defaultBrandStyle: t("productImproveStage1.defaultBrandStyle"),
    });

    return data<BatchAITasksResponse>({
      ok: true,
      created: result.taskIds.length,
      taskIds: result.taskIds,
      errors: result.errors,
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

  const result = await createPictureTranslateBatchTasks({
    shop,
    sourceCode: body.sourceCode,
    targetCode: body.targetCode,
    modelType: body.modelType,
    items: body.items,
  });

  return data<BatchAITasksResponse>({
    ok: true,
    created: result.taskIds.length,
    taskIds: result.taskIds,
    errors: result.errors,
  });
};
