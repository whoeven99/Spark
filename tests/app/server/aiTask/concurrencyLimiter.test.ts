import { describe, expect, it } from "vitest";
import {
  getShopAiTaskLimiter,
  resetShopAiTaskLimitersForTests,
  Semaphore,
} from "../../../../app/server/aiTask/concurrencyLimiter.server";

describe("Semaphore", () => {
  it("queues work when slots are full", async () => {
    const sem = new Semaphore(1);
    let running = 0;
    let maxRunning = 0;

    const job = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
    };

    await Promise.all([sem.run(job), sem.run(job), sem.run(job)]);
    expect(maxRunning).toBe(1);
  });
});

describe("getShopAiTaskLimiter", () => {
  it("isolates concurrency per shop", async () => {
    resetShopAiTaskLimitersForTests();
    process.env.SHOP_AI_TASK_CONCURRENCY = "1";

    const a = getShopAiTaskLimiter("shop-a.myshopify.com");
    const b = getShopAiTaskLimiter("shop-b.myshopify.com");
    expect(a).not.toBe(b);

    let aRunning = 0;
    let bRunning = 0;
    let bothRunning = false;

    const runA = a.run(async () => {
      aRunning += 1;
      await new Promise((r) => setTimeout(r, 30));
      if (bRunning > 0) bothRunning = true;
      aRunning -= 1;
    });
    const runB = b.run(async () => {
      bRunning += 1;
      await new Promise((r) => setTimeout(r, 30));
      if (aRunning > 0) bothRunning = true;
      bRunning -= 1;
    });

    await Promise.all([runA, runB]);
    expect(bothRunning).toBe(true);

    delete process.env.SHOP_AI_TASK_CONCURRENCY;
    resetShopAiTaskLimitersForTests();
  });
});
