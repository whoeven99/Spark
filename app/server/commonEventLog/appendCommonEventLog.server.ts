import { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import type { CommonEventType } from "./types.server";

function isCommonEventLogUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function appendCommonEventLog(params: {
  shop: string;
  eventType: CommonEventType;
  topic?: string;
  referenceId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean }> {
  const shop = params.shop.trim();
  if (!shop) return { created: false };

  if (params.referenceId) {
    const existing = await prisma.commonEventLog.findFirst({
      where: {
        shop,
        eventType: params.eventType,
        referenceId: params.referenceId,
      },
    });
    if (existing) return { created: false };
  }

  try {
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
    return { created: true };
  } catch (error) {
    if (isCommonEventLogUniqueViolation(error)) {
      return { created: false };
    }
    throw error;
  }
}
