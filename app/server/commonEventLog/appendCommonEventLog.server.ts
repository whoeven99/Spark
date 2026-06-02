import type { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import type { CommonEventType } from "./types.server";

export async function appendCommonEventLog(params: {
  shop: string;
  appName: string;
  eventType: CommonEventType;
  topic?: string;
  referenceId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean }> {
  const shop = params.shop.trim();
  const appName = params.appName.trim();
  if (!shop || !appName) return { created: false };

  if (params.referenceId) {
    const existing = await prisma.commonEventLog.findFirst({
      where: {
        shop,
        appName,
        eventType: params.eventType,
        referenceId: params.referenceId,
      },
    });
    if (existing) return { created: false };
  }

  await prisma.commonEventLog.create({
    data: {
      shop,
      appName,
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
  return { created: true };
}
