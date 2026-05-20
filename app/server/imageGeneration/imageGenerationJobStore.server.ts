import type { Prisma } from "../../generated/prisma";
import {
  createPendingShopVisualJob,
  getShopVisualJobForShop,
  listRecentShopVisualJobsForShop,
  markShopVisualJobFailed,
  markShopVisualJobSucceeded,
} from "../shopVisualJob/shopVisualJobStore.server";
import { SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION } from "../shopVisualJob/types.server";
import { buildImageGenerationJobMetadata } from "./imageGenerationJobMetadata.server";
import type {
  ImageGenerationHistoryItem,
  ImageGenerationJobStatus,
} from "./types";

const KIND = SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION;

export async function createPendingGeneratedImageJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
  description?: string;
}): Promise<void> {
  const metadata =
    params.description?.trim() ?
      buildImageGenerationJobMetadata({ description: params.description })
    : undefined;

  await createPendingShopVisualJob({
    requestId: params.requestId,
    shop: params.shop,
    kind: KIND,
    summary: params.prompt,
    metadata,
  });
}

export async function markGeneratedImageJobSucceeded(params: {
  requestId: string;
  blobPath: string;
  provider: string;
}): Promise<void> {
  await markShopVisualJobSucceeded({
    requestId: params.requestId,
    blobPath: params.blobPath,
    provider: params.provider,
  });
}

export async function markGeneratedImageJobFailed(params: {
  requestId: string;
  errorMsg: string;
}): Promise<void> {
  await markShopVisualJobFailed(params);
}

export async function getGeneratedImageJobForShop(params: {
  requestId: string;
  shop: string;
}): Promise<{
  requestId: string;
  status: ImageGenerationJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
} | null> {
  const job = await getShopVisualJobForShop({
    requestId: params.requestId,
    shop: params.shop,
    kind: KIND,
  });
  if (!job) return null;
  return {
    requestId: job.requestId,
    status: job.status,
    imageUrl: job.imageUrl,
    errorMsg: job.errorMsg,
  };
}

export async function listRecentGeneratedImageJobsForShop(
  shop: string,
): Promise<ImageGenerationHistoryItem[]> {
  const rows = await listRecentShopVisualJobsForShop({ shop, kind: KIND });
  return rows.map((row) => ({
    requestId: row.requestId,
    kind: "image_generation" as const,
    prompt: row.summary,
    summary: row.summary,
    ...(row.description ? { description: row.description } : {}),
    status: row.status,
    imageUrl: row.imageUrl,
    errorMsg: row.errorMsg,
    provider: row.provider,
    createdAt: row.createdAt,
  }));
}

export async function persistSyncImageGenerationJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
  description?: string;
  result: Awaited<
    ReturnType<typeof import("./imageGenerationExecutor.server").executeImageGeneration>
  >;
}): Promise<void> {
  const metadata =
    params.description?.trim() ?
      buildImageGenerationJobMetadata({ description: params.description })
    : undefined;

  await createPendingShopVisualJob({
    requestId: params.requestId,
    shop: params.shop,
    kind: KIND,
    summary: params.prompt,
    metadata,
  });
  if (!params.result.ok) {
    await markShopVisualJobFailed({
      requestId: params.requestId,
      errorMsg: params.result.errorMsg,
    });
    return;
  }
  await markShopVisualJobSucceeded({
    requestId: params.requestId,
    blobPath: params.result.blobPath,
    provider: params.result.provider,
  });
}
