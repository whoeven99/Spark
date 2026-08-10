/**
 * 平台账户枚举类数据的进程内 TTL 缓存。
 *
 * 适用对象是 Meta Page、TikTok Pixel / Catalog、广告主列表这类「由平台持有、体量很小、
 * 以周月为单位变化」的下拉选项数据。它们此前每次打开表单都要现打一次外部接口。
 *
 * 边界：
 * - 只缓存只读列表。绑定校验、同步预检等需要实时状态的路径不要接。
 * - 缓存仅在单进程内有效，重启即失效；不引入额外存储。
 * - TTL 故意取短，避免商户刚在平台侧新建资源却长时间看不到。
 */

/** 下拉选项类数据的默认缓存时长。 */
export const ENUMERATION_CACHE_TTL_MS = 5 * 60 * 1000;

/** 缓存条目上限，防止多租户进程无上限增长。 */
const MAX_ENTRIES = 500;

type CacheEntry<T> = { value: T; expiresAt: number };

export type EnumerationCache<T> = {
  /**
   * 读取缓存，未命中或已过期时用 `loader` 回源。
   * 同一 key 的并发请求会共享同一次回源，避免缓存击穿。
   */
  get(key: string, loader: () => Promise<T>, options?: { refresh?: boolean }): Promise<T>;
  invalidate(key: string): void;
};

export function createEnumerationCache<T>(
  ttlMs: number = ENUMERATION_CACHE_TTL_MS,
): EnumerationCache<T> {
  const entries = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function prune(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    // 全部条目都还新鲜却仍超限时，按插入顺序淘汰最旧的。
    while (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  }

  function load(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;

    const pending = loader()
      .then((value) => {
        const now = Date.now();
        entries.set(key, { value, expiresAt: now + ttlMs });
        prune(now);
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
    return pending;
  }

  return {
    async get(key, loader, options) {
      if (!options?.refresh) {
        const hit = entries.get(key);
        if (hit && hit.expiresAt > Date.now()) return hit.value;
      } else {
        entries.delete(key);
      }
      return load(key, loader);
    },
    invalidate(key) {
      entries.delete(key);
    },
  };
}

/** 解析 `?refresh=1` 之类的强制刷新参数。 */
export function parseRefreshFlag(raw: string | null): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
