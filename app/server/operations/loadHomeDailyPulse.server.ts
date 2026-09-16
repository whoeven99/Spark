import prisma from "../../db.server";
import { resolveHomeDailyPulse, type DailyPulse } from "../../lib/dailyPulse";
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

/** 有快照就出结论；没快照时仅在回补中或订单为 0 时给句子，避免误显示「去回补」。 */
export async function loadHomeDailyPulse(
  shop: string,
  options?: { now?: Date; timeZone?: string },
): Promise<DailyPulse | null> {
  const [overview, checkpoint, orderCount] = await Promise.all([
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
    prisma.shopOrder.count({ where: { shop } }),
  ]);

  const backfillRunning = Boolean(
    checkpoint &&
      isFreshBackfillRunning(checkpoint.lastCursor, checkpoint.lastSyncedAt),
  );

  return resolveHomeDailyPulse(
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
    { backfillRunning, orderCount },
  );
}
