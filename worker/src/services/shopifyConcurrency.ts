/**
 * 按 shop 的 Shopify 写入自适应并发(AIMD)。
 *
 * shopifyFetch 每次响应后调用 noteShopifyThrottle，依据 extensions.cost.throttleStatus
 * 调整该 shop 的并发上限：桶有富余 → 加性增(+1)，桶紧张/429 → 乘性减(/2)。
 * writeback / verify 用 runShopifyAdaptive 跑，并发随 cap 动态增减。
 */
const MIN_CAP = 1;
const MAX_CAP = Math.max(1, Number(process.env.SHOPIFY_MAX_CONCURRENCY) || 10);
const INIT_CAP = Math.max(
  MIN_CAP,
  Math.min(MAX_CAP, Number(process.env.SHOPIFY_INIT_CONCURRENCY) || 3),
);

type ShopConc = { cap: number };
const _conc = new Map<string, ShopConc>();

function entry(shop: string): ShopConc {
  let c = _conc.get(shop);
  if (!c) {
    c = { cap: INIT_CAP };
    _conc.set(shop, c);
  }
  return c;
}

export function getShopifyCap(shop: string): number {
  return entry(shop).cap;
}

/** 每次 Shopify 响应后调用：依据桶余量 AIMD 调整该 shop 的并发上限。 */
export function noteShopifyThrottle(
  shop: string,
  throttle: { currentlyAvailable: number; maximumAvailable: number } | undefined | null,
  was429: boolean,
): void {
  const c = entry(shop);
  if (was429) {
    c.cap = Math.max(MIN_CAP, Math.floor(c.cap / 2));
    return;
  }
  if (!throttle || !throttle.maximumAvailable) return;
  const ratio = throttle.currentlyAvailable / throttle.maximumAvailable;
  if (ratio >= 0.5) {
    c.cap = Math.min(MAX_CAP, c.cap + 1); // 桶富余 → 加性增
  } else if (ratio <= 0.25) {
    c.cap = Math.max(MIN_CAP, Math.floor(c.cap / 2)); // 桶紧张 → 乘性减
  }
}

/**
 * 自适应并发跑一批任务：在飞数量随 getShopifyCap(shop) 动态增减(任务完成时重读 cap)。
 * 单个任务失败只记日志、不中断整批(适合 writeback/verify 这种逐资源容错的场景)。
 */
export async function runShopifyAdaptive<T>(
  shop: string,
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  let active = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      if (next >= items.length && active === 0) {
        resolve();
        return;
      }
      while (active < Math.max(MIN_CAP, getShopifyCap(shop)) && next < items.length) {
        const i = next++;
        active++;
        Promise.resolve()
          .then(() => fn(items[i], i))
          .catch((e) => console.error(`[shopifyAdaptive] item ${i} failed:`, e))
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    pump();
  });
}
