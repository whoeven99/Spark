import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  deleteTaskForShop,
  markTaskApplied,
  markTaskAppliedWithResult,
  markTaskScored,
  getTaskForShop,
} from "../server/aiTask/aiTaskStore.server";
import { appendLog, pendingReviewTask } from "../server/aiTask/aiTaskLogger.server";
import { cleanupTaskBlobs } from "../server/aiTask/aiTaskBlobCleanup.server";
import type { AITaskDeleteResponse } from "../lib/aiTaskTypes";
import type {
  ProductImproveTaskConfig,
  ProductImproveTaskResult,
} from "../lib/aiTaskTypes";
import { runProductDescriptionRefinement } from "../server/productImprove/services/refineDescriptionService";
import { detectRequestLocale, readShopifySessionLocale } from "../i18n/detector.server";
import { initI18n } from "../i18n";

function translateApiAiTaskErrorMessage(
  rawMessage: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const normalized = rawMessage.trim();
  if (!normalized) {
    return t("productImproveStage1.serverRequestFailed");
  }
  if (normalized === "Invalid request body") {
    return t("productImproveStage1.serverInvalidRequestBody");
  }
  if (normalized === "Task not found") {
    return t("productImproveStage1.serverTaskNotFound");
  }
  if (normalized === "Task is not in reviewable state") {
    return t("productImproveStage1.serverTaskNotReviewable");
  }
  if (normalized === "Task is not in scorable state") {
    return t("productImproveStage1.serverTaskNotScorable");
  }
  if (normalized === "Task is not in refinable state") {
    return t("productImproveStage1.serverTaskNotRefinable");
  }
  if (normalized === "继续 AI 优化前请提供当前草稿和优化说明") {
    return t("productImproveStage1.refineProvideDraftAndComment");
  }
  if (normalized === "AI 优化失败") {
    return t("productImproveStage1.refineAiGenerationFailed");
  }
  if (normalized === "AI 输出结构异常") {
    return t("productImproveStage1.refineAiOutputInvalid");
  }
  if (normalized === "Unknown action") {
    return t("productImproveStage1.serverUnknownAction");
  }
  return rawMessage;
}

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<Response> => {
  const initialLocale = detectRequestLocale(request);
  const initialI18n = initI18n(initialLocale);
  const initialT = initialI18n.t.bind(initialI18n);

  if (request.method !== "POST") {
    return Response.json(
      { error: initialT("productImproveStage1.serverMethodNotAllowed") },
      { status: 405 },
    );
  }

  const { session } = await authenticate.admin(request);
  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  const i18n = initI18n(locale);
  const t = i18n.t.bind(i18n);
  const shop = session.shop;

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    taskId?: string;
    result?: Record<string, unknown>;
    draftTitle?: string;
    draftDescription?: string;
    optimizationComment?: string;
  } | null;

  if (!body || !body.taskId) {
    return Response.json(
      {
        success: false,
        errorCode: 40000,
        errorMsg: t("productImproveStage1.serverInvalidRequestBody"),
      },
      { status: 400 },
    );
  }

  if (body.action === "delete") {
    const result = await deleteTaskForShop({ taskId: body.taskId, shop });

    if (!result.ok) {
      const response: AITaskDeleteResponse = {
        success: false,
        errorCode: result.status,
        errorMsg: result.errorMsg,
      };
      return Response.json(response, { status: result.status });
    }

    await cleanupTaskBlobs(result.taskType, result.result);

    const response: AITaskDeleteResponse = {
      success: true,
      taskId: body.taskId,
    };
    return Response.json(response);
  }

  if (body.action === "apply") {
    const task = await getTaskForShop({ taskId: body.taskId, shop });
    if (!task) {
      return Response.json(
        { success: false, errorCode: 40401, errorMsg: t("productImproveStage1.serverTaskNotFound") },
        { status: 404 },
      );
    }
    if (task.status !== "pending_review" && task.status !== "scored") {
      return Response.json(
        {
          success: false,
          errorCode: 40002,
          errorMsg: t("productImproveStage1.serverTaskNotReviewable"),
        },
        { status: 400 },
      );
    }
    if (body.result) {
      await markTaskAppliedWithResult({ taskId: body.taskId, result: body.result });
    } else {
      await markTaskApplied(body.taskId);
    }
    return Response.json({ success: true, taskId: body.taskId });
  }

  if (body.action === "score") {
    const task = await getTaskForShop({ taskId: body.taskId, shop });
    if (!task) {
      return Response.json(
        { success: false, errorCode: 40401, errorMsg: t("productImproveStage1.serverTaskNotFound") },
        { status: 404 },
      );
    }
    if (task.status !== "pending_review" && task.status !== "scored") {
      return Response.json(
        {
          success: false,
          errorCode: 40003,
          errorMsg: t("productImproveStage1.serverTaskNotScorable"),
        },
        { status: 400 },
      );
    }
    await markTaskScored({ taskId: body.taskId, result: body.result });
    return Response.json({ success: true, taskId: body.taskId });
  }

  if (body.action === "refine") {
    const task = await getTaskForShop({ taskId: body.taskId, shop });
    if (!task) {
      return Response.json(
        { success: false, errorCode: 40401, errorMsg: t("productImproveStage1.serverTaskNotFound") },
        { status: 404 },
      );
    }
    if (
      task.taskType !== "product_improve" ||
      (task.status !== "pending_review" &&
        task.status !== "scored" &&
        task.status !== "applied")
    ) {
      return Response.json(
        {
          success: false,
          errorCode: 40004,
          errorMsg: t("productImproveStage1.serverTaskNotRefinable"),
        },
        { status: 400 },
      );
    }

    const cfg = task.config as Partial<ProductImproveTaskConfig>;
    const existing = (task.result ?? {}) as Partial<ProductImproveTaskResult>;
    const optimizationComment = body.optimizationComment?.trim() ?? "";
    const draftTitle = body.draftTitle?.trim() || existing.title?.trim() || cfg.originalTitle?.trim() || "";
    const draftDescription =
      body.draftDescription?.trim() ||
      existing.description?.trim() ||
      cfg.originalText?.trim() ||
      "";

    if (!draftTitle || !draftDescription || !optimizationComment) {
      return Response.json(
        {
          success: false,
          errorCode: 40005,
          errorMsg: t("productImproveStage1.refineProvideDraftAndComment"),
        },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    await appendLog({
      taskId: body.taskId,
      startedAt,
      message: t("productImproveStage1.refineReceivedFeedbackLog"),
    });

    const refined = await runProductDescriptionRefinement({
      shop,
      context: {
        id: cfg.productId?.trim() || body.taskId,
        title: cfg.originalTitle?.trim() || draftTitle,
        text: cfg.originalText?.trim() || draftDescription,
      },
      targetLanguage: cfg.targetLanguage?.trim() || "zh-CN",
      currentTitle: draftTitle,
      currentDescription: draftDescription,
      optimizationComment,
      requestId: body.taskId,
    });

    if (!refined.ok) {
      await appendLog({
        taskId: body.taskId,
        startedAt,
        message: t("productImproveStage1.refineFailedLog", {
          reason: translateApiAiTaskErrorMessage(refined.errorMsg, t),
        }),
      });
      return Response.json(
        {
          success: false,
          errorCode: refined.errorCode,
          errorMsg: translateApiAiTaskErrorMessage(refined.errorMsg, t),
        },
        { status: 400 },
      );
    }

    const nextResult: ProductImproveTaskResult = {
      title: refined.data.title,
      description: refined.data.description,
      reviewNote: existing.reviewNote,
      optimizationComment,
    };

    await pendingReviewTask({
      taskId: body.taskId,
      result: nextResult,
      startedAt,
      finalMessage: t("productImproveStage1.refineCompletedPendingReview"),
    });
    return Response.json({ success: true, taskId: body.taskId, result: nextResult });
  }

  return Response.json(
    {
      success: false,
      errorCode: 40000,
      errorMsg: t("productImproveStage1.serverUnknownAction"),
    },
    { status: 400 },
  );
};
