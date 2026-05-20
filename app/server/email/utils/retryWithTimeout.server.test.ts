import { describe, expect, it, vi } from "vitest";
import { retryWithTimeout } from "./retryWithTimeout.server";

describe("retryWithTimeout", () => {
  it("returns result on first success", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    const result = await retryWithTimeout(task, {
      timeoutMs: 1000,
      maxRetries: 3,
    });
    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const result = await retryWithTimeout(task, {
      timeoutMs: 1000,
      maxRetries: 3,
    });
    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not retry on HTTP 400 style errors", async () => {
    const task = vi.fn().mockRejectedValue(new Error('{"status":400}'));
    await expect(
      retryWithTimeout(task, { timeoutMs: 1000, maxRetries: 3 }),
    ).rejects.toThrow('{"status":400}');
    expect(task).toHaveBeenCalledTimes(1);
  });
});
