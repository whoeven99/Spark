import { describe, expect, it, vi } from "vitest";
import {
  createEnumerationCache,
  parseRefreshFlag,
} from "../../../../app/server/adsCatalog/enumerationCache.server";

describe("createEnumerationCache", () => {
  it("只回源一次，后续命中缓存", async () => {
    const cache = createEnumerationCache<string[]>();
    const loader = vi.fn().mockResolvedValue(["page-1"]);

    expect(await cache.get("shop-a", loader)).toEqual(["page-1"]);
    expect(await cache.get("shop-a", loader)).toEqual(["page-1"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("按 key 隔离，不同店铺各自回源", async () => {
    const cache = createEnumerationCache<string>();
    const loader = vi.fn().mockImplementation(async () => "value");

    await cache.get("shop-a", loader);
    await cache.get("shop-b", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("并发请求共享同一次回源，避免缓存击穿", async () => {
    const cache = createEnumerationCache<number>();
    let resolveLoader: ((value: number) => void) | undefined;
    const loader = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const first = cache.get("shop-a", loader);
    const second = cache.get("shop-a", loader);
    resolveLoader?.(42);

    expect(await first).toBe(42);
    expect(await second).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("TTL 到期后重新回源", async () => {
    vi.useFakeTimers();
    try {
      const cache = createEnumerationCache<string>(1000);
      const loader = vi.fn().mockResolvedValue("v");

      await cache.get("shop-a", loader);
      vi.setSystemTime(Date.now() + 1001);
      await cache.get("shop-a", loader);

      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refresh 与 invalidate 都会绕过缓存", async () => {
    const cache = createEnumerationCache<string>();
    const loader = vi.fn().mockResolvedValue("v");

    await cache.get("shop-a", loader);
    await cache.get("shop-a", loader, { refresh: true });
    expect(loader).toHaveBeenCalledTimes(2);

    cache.invalidate("shop-a");
    await cache.get("shop-a", loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("回源失败不会写入缓存，下次仍会重试", async () => {
    const cache = createEnumerationCache<string>();
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");

    await expect(cache.get("shop-a", loader)).rejects.toThrow("boom");
    expect(await cache.get("shop-a", loader)).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("parseRefreshFlag", () => {
  it("识别真值写法", () => {
    expect(parseRefreshFlag("1")).toBe(true);
    expect(parseRefreshFlag("true")).toBe(true);
    expect(parseRefreshFlag(" YES ")).toBe(true);
  });

  it("其余情况一律不刷新", () => {
    expect(parseRefreshFlag(null)).toBe(false);
    expect(parseRefreshFlag("")).toBe(false);
    expect(parseRefreshFlag("0")).toBe(false);
    expect(parseRefreshFlag("no")).toBe(false);
  });
});
