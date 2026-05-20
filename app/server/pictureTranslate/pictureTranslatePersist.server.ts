import type { Prisma } from "../../generated/prisma";
import {
  buildPictureTranslateJobSummary,
  recordPictureTranslateJobSucceeded,
} from "./pictureTranslateJobStore.server";
import type { PictureTranslateExecutorSuccess } from "./pictureTranslateExecutor.server";

export async function persistPictureTranslateSuccess(params: {
  requestId: string;
  shop: string;
  sourceLanguage: string;
  targetLanguage: string;
  pipeline: PictureTranslateExecutorSuccess;
  extraMetadata?: Prisma.InputJsonValue;
}): Promise<void> {
  if (!params.pipeline.blobPath) {
    console.info(
      `[PictureTranslate] skip job persist requestId=${params.requestId} reason=no_blob_path`,
    );
    return;
  }

  try {
    await recordPictureTranslateJobSucceeded({
      requestId: params.requestId,
      shop: params.shop,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      blobPath: params.pipeline.blobPath,
      provider: params.pipeline.provider,
      metadata: params.extraMetadata,
    });
  } catch (e) {
    console.error(
      `[PictureTranslate] persist job failed requestId=${params.requestId} summary=${buildPictureTranslateJobSummary(
        {
          sourceLanguage: params.sourceLanguage,
          targetLanguage: params.targetLanguage,
        },
      )}`,
      e,
    );
  }
}
