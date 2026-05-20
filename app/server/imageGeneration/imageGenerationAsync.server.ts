import { IMAGE_GENERATION_LOG_PREFIX } from "./constants.server";
import { executeImageGeneration } from "./imageGenerationExecutor.server";
import {
  createPendingGeneratedImageJob,
  markGeneratedImageJobFailed,
  markGeneratedImageJobSucceeded,
} from "./imageGenerationJobStore.server";

const LOG_PREFIX = `${IMAGE_GENERATION_LOG_PREFIX}[Async]`;

export function isImageGenerationAsyncEnabled(): boolean {
  const raw = process.env.IMAGE_GEN_ASYNC?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

export function enqueueImageGenerationJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
}): void {
  void runImageGenerationJob(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} unhandled requestId=${params.requestId} detail=${detail}`,
    );
    void markGeneratedImageJobFailed({
      requestId: params.requestId,
      errorMsg: detail || "图片生成任务异常终止",
    });
  });
}

async function runImageGenerationJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
}): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG_PREFIX} start requestId=${params.requestId} shop=${params.shop}`,
  );

  const result = await executeImageGeneration({
    requestId: params.requestId,
    shop: params.shop,
    prompt: params.prompt,
  });

  if (!result.ok) {
    await markGeneratedImageJobFailed({
      requestId: params.requestId,
      errorMsg: result.errorMsg,
    });
    console.info(
      `${LOG_PREFIX} failed requestId=${params.requestId} reason=${result.reason} elapsedMs=${Date.now() - startedAt}`,
    );
    return;
  }

  await markGeneratedImageJobSucceeded({
    requestId: params.requestId,
    blobPath: result.blobPath,
    provider: result.provider,
  });

  console.info(
    `${LOG_PREFIX} ok requestId=${params.requestId} elapsedMs=${Date.now() - startedAt}`,
  );
}

export async function startImageGenerationJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
  description?: string;
}): Promise<void> {
  await createPendingGeneratedImageJob(params);
  enqueueImageGenerationJob(params);
}
