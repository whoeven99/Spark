import prisma from "../../db.server";

/**
 * 店铺套餐快照：用于功能埋点附带 plan 维度。
 *
 * 埋点路由是高频端点，直接每次查 Turso 会放大数据库压力，因此用进程内
 * TTL 缓存（默认 5 分钟）兜底。读取失败一律静默降级为空串，不影响埋点主流程。
 */

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { value: string; expiresAt: number }>();

/** 返回形如 `planKey/STATUS` 的套餐快照；无订阅或读取失败返回空串。 */
export async function getShopPlanSnapshot(shop: string): Promise<string> {
  if (!shop) return "";

  const now = Date.now();
  const hit = cache.get(shop);
  if (hit && hit.expiresAt > now) return hit.value;

  let value = "";
  try {
    const sub = await prisma.appSubscription.findUnique({
      where: { shop },
      select: { planKey: true, status: true },
    });
    if (sub) value = `${sub.planKey}/${sub.status}`;
  } catch (err) {
    console.warn(`[featureTrack] plan snapshot failed for ${shop}:`, err);
  }

  cache.set(shop, { value, expiresAt: now + TTL_MS });
  return value;
}
