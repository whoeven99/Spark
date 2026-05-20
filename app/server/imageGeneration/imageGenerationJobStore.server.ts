import prisma from "../../db.server";
import { getGeneratedImageReadUrl } from "./imageGenerationBlob.server";
import type {
  ImageGenerationHistoryItem,
  ImageGenerationJobStatus,
} from "./types";

const HISTORY_LIMIT = 12;

function toJobStatus(raw: string): ImageGenerationJobStatus {
  if (raw === "succeeded" || raw === "failed" || raw === "pending") {
    return raw;
  }
  return "failed";
}

export async function createPendingGeneratedImageJob(params: {
  requestId: string;
  shop: string;
  prompt: string;
}): Promise<void> {
  await prisma.generatedImageJob.create({
    data: {
      requestId: params.requestId,
      shop: params.shop,
      prompt: params.prompt,
      status: "pending",
    },
  });
}

export async function markGeneratedImageJobSucceeded(params: {
  requestId: string;
  blobPath: string;
  provider: string;
}): Promise<void> {
  await prisma.generatedImageJob.update({
    where: { requestId: params.requestId },
    data: {
      status: "succeeded",
      blobPath: params.blobPath,
      provider: params.provider,
      errorMsg: null,
    },
  });
}

export async function markGeneratedImageJobFailed(params: {
  requestId: string;
  errorMsg: string;
}): Promise<void> {
  await prisma.generatedImageJob.update({
    where: { requestId: params.requestId },
    data: {
      status: "failed",
      errorMsg: params.errorMsg.slice(0, 2000),
    },
  });
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
  const row = await prisma.generatedImageJob.findFirst({
    where: { requestId: params.requestId, shop: params.shop },
  });
  if (!row) return null;

  const status = toJobStatus(row.status);
  return {
    requestId: row.requestId,
    status,
    imageUrl: row.blobPath ? getGeneratedImageReadUrl(row.blobPath) : null,
    errorMsg: row.errorMsg,
  };
}

export async function listRecentGeneratedImageJobsForShop(
  shop: string,
): Promise<ImageGenerationHistoryItem[]> {
  const rows = await prisma.generatedImageJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  return rows.map((row) => {
    const status = toJobStatus(row.status);
    return {
      requestId: row.requestId,
      prompt: row.prompt,
      status,
      imageUrl: row.blobPath ? getGeneratedImageReadUrl(row.blobPath) : null,
      errorMsg: row.errorMsg,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
