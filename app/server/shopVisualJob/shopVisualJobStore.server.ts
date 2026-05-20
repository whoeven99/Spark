import type { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import { getGeneratedImageReadUrl } from "../imageGeneration/imageGenerationBlob.server";
import type {
  ShopVisualJobHistoryItem,
  ShopVisualJobKind,
  ShopVisualJobStatus,
} from "./types.server";

const HISTORY_LIMIT = 12;

function toJobStatus(raw: string): ShopVisualJobStatus {
  if (raw === "succeeded" || raw === "failed" || raw === "pending") {
    return raw;
  }
  return "failed";
}

async function resolveImageUrl(blobPath: string | null | undefined): Promise<string | null> {
  if (!blobPath?.trim()) return null;
  try {
    return getGeneratedImageReadUrl(blobPath.trim());
  } catch (e) {
    console.error("[ShopVisualJob] resolve image url failed", e);
    return null;
  }
}

function rowToHistoryItem(row: {
  requestId: string;
  kind: string;
  summary: string;
  status: string;
  blobPath: string | null;
  errorMsg: string | null;
  provider: string | null;
  createdAt: Date;
  imageUrl: string | null;
}): ShopVisualJobHistoryItem {
  const kind =
    row.kind === "picture_translate" ? "picture_translate" : "image_generation";
  return {
    requestId: row.requestId,
    kind,
    summary: row.summary,
    status: toJobStatus(row.status),
    imageUrl: row.imageUrl,
    errorMsg: row.errorMsg,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createPendingShopVisualJob(params: {
  requestId: string;
  shop: string;
  kind: ShopVisualJobKind;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.shopVisualJob.create({
    data: {
      requestId: params.requestId,
      shop: params.shop,
      kind: params.kind,
      summary: params.summary,
      status: "pending",
      metadata: params.metadata,
    },
  });
}

export async function markShopVisualJobSucceeded(params: {
  requestId: string;
  blobPath: string;
  provider?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.shopVisualJob.update({
    where: { requestId: params.requestId },
    data: {
      status: "succeeded",
      blobPath: params.blobPath,
      provider: params.provider ?? null,
      errorMsg: null,
      ...(params.metadata != null ? { metadata: params.metadata } : {}),
    },
  });
}

export async function markShopVisualJobFailed(params: {
  requestId: string;
  errorMsg: string;
}): Promise<void> {
  await prisma.shopVisualJob.update({
    where: { requestId: params.requestId },
    data: {
      status: "failed",
      errorMsg: params.errorMsg.slice(0, 2000),
    },
  });
}

export async function recordShopVisualJobSucceeded(params: {
  requestId: string;
  shop: string;
  kind: ShopVisualJobKind;
  summary: string;
  blobPath: string;
  provider?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.shopVisualJob.upsert({
    where: { requestId: params.requestId },
    create: {
      requestId: params.requestId,
      shop: params.shop,
      kind: params.kind,
      summary: params.summary,
      status: "succeeded",
      blobPath: params.blobPath,
      provider: params.provider ?? null,
      metadata: params.metadata,
    },
    update: {
      status: "succeeded",
      blobPath: params.blobPath,
      provider: params.provider ?? null,
      errorMsg: null,
      summary: params.summary,
      ...(params.metadata != null ? { metadata: params.metadata } : {}),
    },
  });
}

export async function getShopVisualJobForShop(params: {
  requestId: string;
  shop: string;
  kind?: ShopVisualJobKind;
}): Promise<{
  requestId: string;
  status: ShopVisualJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
  summary: string;
} | null> {
  const row = await prisma.shopVisualJob.findFirst({
    where: {
      requestId: params.requestId,
      shop: params.shop,
      ...(params.kind ? { kind: params.kind } : {}),
    },
  });
  if (!row) return null;

  return {
    requestId: row.requestId,
    status: toJobStatus(row.status),
    imageUrl: await resolveImageUrl(row.blobPath),
    errorMsg: row.errorMsg,
    summary: row.summary,
  };
}

export async function listRecentShopVisualJobsForShop(params: {
  shop: string;
  kind: ShopVisualJobKind;
}): Promise<ShopVisualJobHistoryItem[]> {
  const rows = await prisma.shopVisualJob.findMany({
    where: { shop: params.shop, kind: params.kind },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const items: ShopVisualJobHistoryItem[] = [];
  for (const row of rows) {
    items.push(
      rowToHistoryItem({
        requestId: row.requestId,
        kind: row.kind,
        summary: row.summary,
        status: row.status,
        blobPath: row.blobPath,
        errorMsg: row.errorMsg,
        provider: row.provider,
        createdAt: row.createdAt,
        imageUrl: await resolveImageUrl(row.blobPath),
      }),
    );
  }
  return items;
}
