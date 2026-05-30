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

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
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
      { success: false, errorCode: 40000, errorMsg: "Invalid request body" },
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
        { success: false, errorCode: 40401, errorMsg: "Task not found" },
        { status: 404 },
      );
    }
    if (task.status !== "pending_review" && task.status !== "scored") {
      return Response.json(
        { success: false, errorCode: 40002, errorMsg: "Task is not in reviewable state" },
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
        { success: false, errorCode: 40401, errorMsg: "Task not found" },
        { status: 404 },
      );
    }
    if (task.status !== "pending_review" && task.status !== "scored") {
      return Response.json(
        { success: false, errorCode: 40003, errorMsg: "Task is not in scorable state" },
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
        { success: false, errorCode: 40401, errorMsg: "Task not found" },
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
        { success: false, errorCode: 40004, errorMsg: "Task is not in refinable state" },
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
          errorMsg: "继续 AI 优化前请提供当前草稿和优化说明",
        },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    await appendLog({
      taskId: body.taskId,
      startedAt,
      message: "已收到人工优化意见，正在继续调用 AI 调整标题与描述",
    });

    const refined = await runProductDescriptionRefinement({
      shop,
      context: {
        id: cfg.productId?.trim() || body.taskId,
        title: cfg.originalTitle?.trim() || draftTitle,
        text: cfg.originalText?.trim() || draftDescription,
      },
      targetLanguage: cfg.targetLanguage?.trim() || "简体中文",
      currentTitle: draftTitle,
      currentDescription: draftDescription,
      optimizationComment,
      requestId: body.taskId,
    });

    if (!refined.ok) {
      await appendLog({
        taskId: body.taskId,
        startedAt,
        message: `AI 继续优化失败：${refined.errorMsg}`,
      });
      return Response.json(
        {
          success: false,
          errorCode: refined.errorCode,
          errorMsg: refined.errorMsg,
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
      finalMessage: "AI 已根据人工意见重新生成文案，请继续审核",
    });
    return Response.json({ success: true, taskId: body.taskId, result: nextResult });
  }

  return Response.json(
    { success: false, errorCode: 40000, errorMsg: "Unknown action" },
    { status: 400 },
  );
};
