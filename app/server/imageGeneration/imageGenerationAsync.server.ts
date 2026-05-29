import { getAppEntry } from "../../config/appEntry.server";
import {
  buildImageGenerateBillingItem,
  buildImagePromptBillingItem,
  normalizeBillingModelKey,
  parseUsageMetadata,
  recordVisualToolTokenUsage,
  type BilledTokenUsageItem,
} from "../tokenUsage/index.server";
import { IMAGE_GENERATION_LOG_PREFIX } from "./constants.server";
import { executeImageGeneration } from "./imageGenerationExecutor.server";
import { generateImagePromptFromDescription } from "./generateImagePromptFromDescription.server";
import {
  appendLog,
  completeTask,
  failTask,
} from "../aiTask/aiTaskLogger.server";
import { getImageGenLimiter } from "../aiTask/concurrencyLimiter.server";

const LOG_PREFIX = `${IMAGE_GENERATION_LOG_PREFIX}[Async]`;

export function enqueueImageGenerationTask(params: {
  taskId: string;
  shop: string;
  /** Direct prompt provided by user. Mutually exclusive with description. */
  prompt?: string;
  /** Natural-language description — AI will generate the prompt from this. */
  description?: string;
  imageProvider: "openai" | "volc";
}): void {
  void runImageGenerationTask(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} unhandled taskId=${params.taskId} detail=${detail}`,
    );
    void failTask({
      taskId: params.taskId,
      errorMsg: detail || "图片生成任务异常终止",
      startedAt: Date.now(),
    });
  });
}

async function runImageGenerationTask(params: {
  taskId: string;
  shop: string;
  prompt?: string;
  description?: string;
  imageProvider: "openai" | "volc";
}): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG_PREFIX} start taskId=${params.taskId} shop=${params.shop}`,
  );

  await appendLog({ taskId: params.taskId, startedAt, message: "图片生成任务开始" });

  // Resolve the final generation prompt and collect billing info for it
  let finalPrompt: string;
  const billingItems: BilledTokenUsageItem[] = [];

  if (params.description && !params.prompt) {
    // Path A: generate prompt from natural-language description via AI
    await appendLog({ taskId: params.taskId, startedAt, message: "已读取生成文字" });
    await appendLog({ taskId: params.taskId, startedAt, message: "正在将文字润色为大模型生成指令..." });

    const promptResult = await generateImagePromptFromDescription({
      description: params.description,
      requestId: params.taskId,
    });

    if (!promptResult.ok) {
      await failTask({
        taskId: params.taskId,
        errorMsg: promptResult.errorMsg,
        startedAt,
        finalMessage: `文字润色失败：${promptResult.errorMsg}`,
      });
      return;
    }

    await appendLog({ taskId: params.taskId, startedAt, message: "文字已优化，适合大模型生成" });

    finalPrompt = promptResult.prompt;
    const promptTokenUsage = parseUsageMetadata(promptResult.usageMeta);
    const promptModelKey = normalizeBillingModelKey(promptResult.modelLabel);
    if (promptTokenUsage.totalTokens > 0) {
      billingItems.push(buildImagePromptBillingItem(promptModelKey, promptTokenUsage));
    }
  } else if (params.prompt) {
    // Path B: user provided a direct prompt
    await appendLog({ taskId: params.taskId, startedAt, message: "已读取图片描述词" });
    finalPrompt = params.prompt;
  } else {
    await failTask({
      taskId: params.taskId,
      errorMsg: "未提供 prompt 或 description",
      startedAt,
    });
    return;
  }

  await appendLog({ taskId: params.taskId, startedAt, message: "大模型正在生成图片..." });

  const result = await getImageGenLimiter().run(() =>
    executeImageGeneration({
      requestId: params.taskId,
      shop: params.shop,
      prompt: finalPrompt,
    }),
  );

  if (!result.ok) {
    await failTask({
      taskId: params.taskId,
      errorMsg: result.errorMsg,
      startedAt,
      finalMessage: `生成失败：${result.errorMsg}`,
    });
    console.info(
      `${LOG_PREFIX} failed taskId=${params.taskId} reason=${result.reason} elapsedMs=${Date.now() - startedAt}`,
    );
    return;
  }

  await appendLog({ taskId: params.taskId, startedAt, message: "图片已生成，正在保存..." });

  await completeTask({
    taskId: params.taskId,
    result: { blobPath: result.blobPath, provider: result.provider },
    finalMessage: "任务完成",
  });

  billingItems.push(buildImageGenerateBillingItem(result.provider));
  await recordVisualToolTokenUsage({
    shop: params.shop,
    appName: getAppEntry(),
    items: billingItems,
  });

  console.info(
    `${LOG_PREFIX} ok taskId=${params.taskId} elapsedMs=${Date.now() - startedAt}`,
  );
}
