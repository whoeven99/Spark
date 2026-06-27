import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisGet = vi.fn(async () => "cached");
const redisSet = vi.fn(async () => "OK");

vi.mock("../../worker/src/services/redisV4.js", () => ({
  getRedis: () => ({
    get: redisGet,
    set: redisSet,
  }),
}));

describe("translationMemory — TRANSLATION_TM_DISABLED", () => {
  const prev = process.env.TRANSLATION_TM_DISABLED;

  beforeEach(() => {
    vi.resetModules();
    redisGet.mockClear();
    redisSet.mockClear();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.TRANSLATION_TM_DISABLED;
    else process.env.TRANSLATION_TM_DISABLED = prev;
  });

  it("reads and writes when disabled is false", async () => {
    process.env.TRANSLATION_TM_DISABLED = "false";
    const { tmGet, tmSet } = await import("../../worker/src/services/translationMemory.js");
    await tmGet("shop.myshopify.com", "ar", "deepseek-v4-flash", "digest1");
    expect(redisGet).toHaveBeenCalled();
    await tmSet("shop.myshopify.com", "ar", "deepseek-v4-flash", "digest1", "hello");
    expect(redisSet).toHaveBeenCalled();
  });

  it("skips reads but still writes when disabled is true", async () => {
    process.env.TRANSLATION_TM_DISABLED = "true";
    const { tmGet, tmSet } = await import("../../worker/src/services/translationMemory.js");
    const hit = await tmGet("shop.myshopify.com", "ar", "deepseek-v4-flash", "digest1");
    expect(hit).toBeNull();
    expect(redisGet).not.toHaveBeenCalled();
    await tmSet("shop.myshopify.com", "ar", "deepseek-v4-flash", "digest1", "hello");
    expect(redisSet).toHaveBeenCalled();
  });
});
