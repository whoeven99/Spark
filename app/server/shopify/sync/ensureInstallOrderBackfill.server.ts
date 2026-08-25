/**
 * 安装后（或首次进 /app）自动回补近 N 天历史订单（默认 30，见 SPARK_ORDER_BACKFILL_DAYS）。
 *
 * 数据落点与增量约定：
 * - 历史：本模块 → backfillOrders（Admin GraphQL）→ Turso ShopOrder* / ShopRefund* / ShopCustomer
 * - 增量：Shopify webhook（orders/paid|cancelled、refunds/create 等）→ 同一套 sync* upsert
 *
 * - fire-and-forget：不阻断壳层 loader
 * - 幂等：ShopSyncCheckpoint.resource = orders_install_bootstrap
 * - 进行中锁：running 且未过期则跳过；超时允许重试
 * - force=true：用于重新安装，清掉 done 门禁再跑一轮
 */

import prisma from "../../../db.server";
import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import { backfillOrders } from "./backfill.server";
import { getOrderBackfillDays } from "./orderBackfillConfig.server";

const LOG = "[InstallBackfill]";

/** 与 ShopSyncCheckpoint.resource 约定；勿与手动回补的 `orders` 混用。 */
export const INSTALL_ORDER_BACKFILL_RESOURCE = "orders_install_bootstrap";

const CURSOR_RUNNING = "running";
const CURSOR_DONE = "done";
const CURSOR_FAILED = "failed";

/** running 超过此时长视为僵死，允许重试。 */
const RUNNING_STALE_MS = 30 * 60 * 1000;

/** 同进程防抖，避免壳层短时间重复进入时并发开跑。 */
const inFlightShops = new Set<string>();

export type EnsureInstallOrderBackfillOptions = {
  /** 重新安装时传 true，忽略已有 done 门禁。 */
  force?: boolean;
};

function isFreshRunning(lastSyncedAt: Date, lastCursor: string | null): boolean {
  if (lastCursor !== CURSOR_RUNNING) return false;
  return Date.now() - lastSyncedAt.getTime() < RUNNING_STALE_MS;
}

async function markBootstrapState(
  shop: string,
  state: typeof CURSOR_RUNNING | typeof CURSOR_DONE | typeof CURSOR_FAILED,
): Promise<void> {
  await prisma.shopSyncCheckpoint.upsert({
    where: { shop_resource: { shop, resource: INSTALL_ORDER_BACKFILL_RESOURCE } },
    create: {
      shop,
      resource: INSTALL_ORDER_BACKFILL_RESOURCE,
      lastSyncedAt: new Date(),
      lastCursor: state,
    },
    update: {
      lastSyncedAt: new Date(),
      lastCursor: state,
    },
  });
}

/**
 * 若尚未完成安装回补，则异步拉近 N 天订单（含退款/客户副作用）。
 * 任何失败只打日志，不抛给调用方。
 */
export async function ensureInstallOrderBackfill(
  shop: string,
  admin: ShopifyAdminGraphqlClient,
  options: EnsureInstallOrderBackfillOptions = {},
): Promise<void> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) return;

  if (inFlightShops.has(normalizedShop)) {
    console.info(`${LOG} skip in-flight shop=${normalizedShop}`);
    return;
  }

  const checkpoint = await prisma.shopSyncCheckpoint.findUnique({
    where: {
      shop_resource: {
        shop: normalizedShop,
        resource: INSTALL_ORDER_BACKFILL_RESOURCE,
      },
    },
  });

  if (!options.force && checkpoint?.lastCursor === CURSOR_DONE) {
    return;
  }

  if (
    !options.force &&
    checkpoint &&
    isFreshRunning(checkpoint.lastSyncedAt, checkpoint.lastCursor)
  ) {
    console.info(`${LOG} skip fresh-running shop=${normalizedShop}`);
    return;
  }

  const daysBack = getOrderBackfillDays();

  inFlightShops.add(normalizedShop);
  try {
    await markBootstrapState(normalizedShop, CURSOR_RUNNING);
    console.info(
      `${LOG} start shop=${normalizedShop} daysBack=${daysBack} force=${Boolean(options.force)}`,
    );

    const result = await backfillOrders(normalizedShop, admin, { daysBack });

    await markBootstrapState(normalizedShop, CURSOR_DONE);
    console.info(
      `${LOG} done shop=${normalizedShop} synced=${result.synced} errors=${result.errors} cursor=${result.cursor ?? "null"}`,
    );
  } catch (error) {
    console.error(`${LOG} failed shop=${normalizedShop}:`, error);
    try {
      await markBootstrapState(normalizedShop, CURSOR_FAILED);
    } catch (markError) {
      console.error(`${LOG} mark-failed also failed shop=${normalizedShop}:`, markError);
    }
  } finally {
    inFlightShops.delete(normalizedShop);
  }
}
