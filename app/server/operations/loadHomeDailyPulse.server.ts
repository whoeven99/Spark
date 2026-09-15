import prisma from "../../db.server";
import { buildDailyPulse, type DailyPulse } from "../../lib/dailyPulse";
import {
  INSTALL_ORDER_BACKFILL_RESOURCE,
} from "../shopify/sync/ensureInstallOrderBackfill.server";
import { peekDailySnapshotOverview } from "./dailyInspection.server";

const RUNNING_STALE_MS = 30 * 60 * 1000;

function isFreshBackfillRunning(
  lastCursor: string | null,
  lastSyncedAt: Date,
): boolean {
  if (lastCursor !== "running") return false;
  return Date.now() - lastSyncedAt.getTime() < RUNNING_STALE_MS;
}

/** 当日快照未就绪且未在回补时返回 null，首页只留空位，避免误显示「去回补」。 */
export async function loadHomeDailyPulse(
  shop: string,
  options?: { now?: Date; timeZone?: string },
): Promise<DailyPulse | null> {
  const [overview, checkpoint] = await Promise.all([
    peekDailySnapshotOverview(shop, {
      now: options?.now,
      timeZone: options?.timeZone,
    }),
    prisma.shopSyncCheckpoint.findUnique({
      where: {
        shop_resource: { shop, resource: INSTALL_ORDER_BACKFILL_RESOURCE },
      },
      select: { lastCursor: true, lastSyncedAt: true },
    }),
  ]);

  const backfillRunning = Boolean(
    checkpoint &&
      isFreshBackfillRunning(checkpoint.lastCursor, checkpoint.lastSyncedAt),
  );

  if (!overview && !backfillRunning) {
    return null;
  }

  return buildDailyPulse(
    overview
      ? {
          hasData: overview.hasData,
          snapshotDate: overview.snapshotDate,
          items: overview.items.map((item) => ({
            name: item.name,
            status: item.status,
          })),
          tasks: overview.tasks.map((task) => ({
            title: task.title,
            status: task.status,
            quadrant: task.quadrant,
          })),
        }
      : null,
    { backfillRunning },
  );
}
