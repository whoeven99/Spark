import type { Prisma } from "../../generated/prisma";
import { recordShopVisualJobSucceeded } from "../shopVisualJob/shopVisualJobStore.server";
import { SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE } from "../shopVisualJob/types.server";

export function buildPictureTranslateJobSummary(params: {
  sourceLanguage: string;
  targetLanguage: string;
}): string {
  const source = params.sourceLanguage.trim() || "auto";
  const target = params.targetLanguage.trim();
  return `${source} → ${target}`;
}

export async function recordPictureTranslateJobSucceeded(params: {
  requestId: string;
  shop: string;
  sourceLanguage: string;
  targetLanguage: string;
  blobPath: string;
  provider: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await recordShopVisualJobSucceeded({
    requestId: params.requestId,
    shop: params.shop,
    kind: SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
    summary: buildPictureTranslateJobSummary({
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
    }),
    blobPath: params.blobPath,
    provider: params.provider,
    metadata: params.metadata,
  });
}
