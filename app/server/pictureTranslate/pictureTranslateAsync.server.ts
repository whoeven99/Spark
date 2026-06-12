import {
  buildPictureTranslateBillingItem,
  recordVisualToolTokenUsage,
} from "../tokenUsage/index.server";
import { executePictureTranslatePipeline } from "./pictureTranslateExecutor.server";
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { getPicTranslateLimiter } from "../aiTask/concurrencyLimiter.server";
import { upsertImageMapping } from "../imageMapping/imageMappingStore.server";

const LOG_PREFIX = "[PictureTranslate][Async]";

export function enqueuePictureTranslateTask(params: {
  taskId: string;
  shop: string;
  imageUrl: string;
  sourceCode: string;
  targetCode: string;
  modelType: 1 | 2;
}): void {
  void runPictureTranslateTask(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} unhandled taskId=${params.taskId} detail=${detail}`,
    );
    void failTask({
      taskId: params.taskId,
      errorMsg: detail || "整图翻译任务异常终止",
      startedAt: Date.now(),
    });
  });
}

async function runPictureTranslateTask(params: {
  taskId: string;
  shop: string;
  imageUrl: string;
  sourceCode: string;
  targetCode: string;
  modelType: 1 | 2;
}): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG_PREFIX} start taskId=${params.taskId} shop=${params.shop}`,
  );

  await appendLog({ taskId: params.taskId, startedAt, message: "正在等待执行任务" });

  const pipeline = await getPicTranslateLimiter().run(async () => {
    return executePictureTranslatePipeline({
      requestId: params.taskId,
      shop: params.shop,
      imageUrl: params.imageUrl,
      sourceLanguage: params.sourceCode,
      targetLanguage: params.targetCode,
      forceModelType: params.modelType,
      onStep: (message) => appendLog({ taskId: params.taskId, startedAt, message }),
    });
  });

  if (!pipeline.ok) {
    const errorMsg = pipeline.detail ?? `翻译失败：${pipeline.reason}`;
    await failTask({
      taskId: params.taskId,
      errorMsg,
      startedAt,
      finalMessage: `翻译失败：${errorMsg}`,
    });
    console.info(
      `${LOG_PREFIX} failed taskId=${params.taskId} reason=${pipeline.reason} elapsedMs=${Date.now() - startedAt}`,
    );
    return;
  }

  const result: Record<string, unknown> = {
    translatedBlobPath: pipeline.blobPath ?? "",
    provider: pipeline.provider,
  };

  const actualCredits = await recordVisualToolTokenUsage({
    shop: params.shop,
    items: [buildPictureTranslateBillingItem(pipeline.provider)],
  });

  await completeTask({
    taskId: params.taskId,
    result,
    actualCredits: actualCredits ?? undefined,
    startedAt,
    finalMessage: "任务完成",
  });

  // 翻译成功后自动写入图片映射，供 Theme App Extension 前台替换使用
  const blobPath = pipeline.blobPath ?? "";
  if (blobPath && params.imageUrl) {
    void upsertImageMapping({
      shop: params.shop,
      sourceUrl: params.imageUrl,
      targetBlobPath: blobPath,
      sourceCode: params.sourceCode,
      targetCode: params.targetCode,
    }).catch((e) => {
      console.error(`${LOG_PREFIX} 写入图片映射失败 taskId=${params.taskId}`, e);
    });
  }

  console.info(
    `${LOG_PREFIX} ok taskId=${params.taskId} elapsedMs=${Date.now() - startedAt}`,
  );
}
