import { describe, expect, it } from "vitest";
import {
  PIXEL_INGEST_LIMITS,
  createRateLimiter,
  validatePixelEnvelope,
} from "../../../../app/server/aliyunLog/pixelIngest.server";

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    ts: Date.now(),
    event: "spark:test",
    schemaVersion: 1,
    shopName: "myshop.myshopify.com",
    clientId: "abc-123",
    source: "web-pixel:ciwi-spark-web-pixel",
    payload: { hello: "world" },
    ...overrides,
  };
}

describe("validatePixelEnvelope", () => {
  it("accepts a well-formed envelope", () => {
    const r = validatePixelEnvelope(baseEnvelope());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envelope.event).toBe("spark:test");
      expect(r.envelope.shopName).toBe("myshop.myshopify.com");
      expect(r.envelope.payload).toEqual({ hello: "world" });
    }
  });

  it("lowercases shopName", () => {
    const r = validatePixelEnvelope(baseEnvelope({ shopName: "MyShop.myshopify.com" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.shopName).toBe("myshop.myshopify.com");
  });

  it("rejects non-object body", () => {
    expect(validatePixelEnvelope(null).ok).toBe(false);
    expect(validatePixelEnvelope("not json").ok).toBe(false);
    expect(validatePixelEnvelope([1, 2]).ok).toBe(false);
  });

  it("rejects event without allowed prefix", () => {
    const r = validatePixelEnvelope(baseEnvelope({ event: "evil:rce" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("accepts shopify: prefix", () => {
    const r = validatePixelEnvelope(baseEnvelope({ event: "shopify:product_viewed" }));
    expect(r.ok).toBe(true);
  });

  it("rejects event with invalid chars", () => {
    const r = validatePixelEnvelope(baseEnvelope({ event: "spark:bad name" }));
    expect(r.ok).toBe(false);
  });

  it("rejects non-myshopify shopName", () => {
    const r = validatePixelEnvelope(baseEnvelope({ shopName: "example.com" }));
    expect(r.ok).toBe(false);
  });

  it("rejects clientId with invalid chars", () => {
    const r = validatePixelEnvelope(baseEnvelope({ clientId: "<script>" }));
    expect(r.ok).toBe(false);
  });

  it("rejects payload exceeding size limit", () => {
    const big = "x".repeat(PIXEL_INGEST_LIMITS.payloadBytes + 100);
    const r = validatePixelEnvelope(baseEnvelope({ payload: { big } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it("rejects array payload", () => {
    const r = validatePixelEnvelope(baseEnvelope({ payload: [1, 2] }));
    expect(r.ok).toBe(false);
  });

  it("normalizes far-future ts to server time", () => {
    const future = Date.now() + 10 * 365 * 24 * 3600_000;
    const r = validatePixelEnvelope(baseEnvelope({ ts: future }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.ts).toBeLessThan(future);
  });

  it("defaults schemaVersion when missing", () => {
    const env = baseEnvelope();
    delete (env as Record<string, unknown>).schemaVersion;
    const r = validatePixelEnvelope(env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.schemaVersion).toBe(1);
  });
});

describe("createRateLimiter", () => {
  it("allows up to maxRequests within window then blocks", () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 3 });
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(true);
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(true);
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(true);
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(false);
  });

  it("scopes buckets per (shop, clientId)", () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
    expect(limiter.take("a.myshopify.com", "c1")).toBe(true);
    expect(limiter.take("a.myshopify.com", "c1")).toBe(false);
    expect(limiter.take("a.myshopify.com", "c2")).toBe(true);
    expect(limiter.take("b.myshopify.com", "c1")).toBe(true);
  });

  it("resets after the window elapses", () => {
    let nowMs = 1_000;
    const limiter = createRateLimiter({
      windowMs: 1000,
      maxRequests: 1,
      now: () => nowMs,
    });
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(true);
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(false);
    nowMs += 1001;
    expect(limiter.take("shop.myshopify.com", "c1")).toBe(true);
  });
});
