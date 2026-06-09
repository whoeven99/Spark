import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  resolveDeepSeekAccountConcurrencyLimit,
  sanitizeDeepSeekUserId,
} from "../../worker/src/services/llmTranslate.js";

describe("sanitizeDeepSeekUserId", () => {
  it("normalizes shop domain to allowed charset", () => {
    expect(sanitizeDeepSeekUserId("Foo.Bar-Shop")).toBe("foo_bar-shop");
    expect(sanitizeDeepSeekUserId("shop.myshopify.com")).toBe("shop_myshopify_com");
  });

  it("truncates to 512 chars", () => {
    const long = "a".repeat(600);
    expect(sanitizeDeepSeekUserId(long).length).toBe(512);
  });
});

describe("resolveDeepSeekAccountConcurrencyLimit", () => {
  const prevLimit = process.env.DEEPSEEK_CONCURRENCY_LIMIT;

  beforeEach(() => {
    delete process.env.DEEPSEEK_CONCURRENCY_LIMIT;
  });

  afterEach(() => {
    if (prevLimit === undefined) delete process.env.DEEPSEEK_CONCURRENCY_LIMIT;
    else process.env.DEEPSEEK_CONCURRENCY_LIMIT = prevLimit;
  });

  it("uses 2500 for flash models", () => {
    expect(resolveDeepSeekAccountConcurrencyLimit("deepseek-v4-flash")).toBe(2500);
  });

  it("uses 500 for pro and legacy chat models", () => {
    expect(resolveDeepSeekAccountConcurrencyLimit("deepseek-v4-pro")).toBe(500);
    expect(resolveDeepSeekAccountConcurrencyLimit("deepseek-chat")).toBe(500);
  });

  it("respects DEEPSEEK_CONCURRENCY_LIMIT override", () => {
    process.env.DEEPSEEK_CONCURRENCY_LIMIT = "120";
    expect(resolveDeepSeekAccountConcurrencyLimit("deepseek-v4-flash")).toBe(120);
  });
});
