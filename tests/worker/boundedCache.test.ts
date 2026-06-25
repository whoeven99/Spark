import { describe, expect, it } from "vitest";
import { BoundedLruMap } from "../../worker/src/services/boundedCache.js";

describe("BoundedLruMap", () => {
  it("evicts least-recently-used entries when over capacity", () => {
    const cache = new BoundedLruMap<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});
