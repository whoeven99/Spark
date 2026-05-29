import type { Prisma } from "../../generated/prisma";
import prisma from "../../db.server";
import type { BillingLogEventType } from "./types.server";

export async function appendBillingLog(params: {
  shop: string;
  appName: string;
  eventType: BillingLogEventType;
  planKey?: string;
  referenceId?: string;
  tokensDelta?: number;
  usedTokens?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const shop = params.shop.trim();
  const appName = params.appName.trim();
  if (!shop || !appName) return;

  const existing =
    params.referenceId && params.eventType
      ? await prisma.billingLog.findFirst({
          where: {
            shop,
            appName,
            eventType: params.eventType,
            referenceId: params.referenceId,
          },
        })
      : null;

  if (existing) return;

  await prisma.billingLog.create({
    data: {
      shop,
      appName,
      eventType: params.eventType,
      planKey: params.planKey,
      referenceId: params.referenceId,
      tokensDelta: params.tokensDelta,
      usedTokens: params.usedTokens,
      metadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
