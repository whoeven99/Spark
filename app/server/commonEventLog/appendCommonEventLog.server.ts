import type { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import type { CommonEventType } from "./types.server";

function isCommonEventLogUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

const DEFAULT_COMMON_EVENT_APP_NAME = "spark";

export async function appendCommonEventLog(params: {
  shop: string;
  appName?: string;
  eventType: CommonEventType;
  topic?: string;
  referenceId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean }> {
  const shop = params.shop.trim();
  const appName = (params.appName ?? DEFAULT_COMMON_EVENT_APP_NAME).trim();
  if (!shop || !appName) return { created: false };

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
  } catch (error) {
    if (isCommonEventLogUniqueViolation(error)) {
      return { created: false };
    }
    throw error;
  }
}
