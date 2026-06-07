import type { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import type { CommonEventType } from "./types.server";

export async function appendCommonEventLog(params: {
  shop: string;
  eventType: CommonEventType;
  topic?: string;
  referenceId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  if (params.referenceId) {
    const existing = await prisma.commonEventLog.findFirst({
      where: {
        shop,
        eventType: params.eventType,
        referenceId: params.referenceId,
      },
    });
    if (existing) return;
  }

  await prisma.commonEventLog.create({
    data: {
      shop,
      eventType: params.eventType,
      topic: params.topic,
      referenceId: params.referenceId,
      payload: params.payload
        ? (params.payload as Prisma.InputJsonValue)
        : undefined,
      metadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
