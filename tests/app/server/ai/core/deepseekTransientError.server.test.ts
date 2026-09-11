import { describe, expect, it } from "vitest";
import {
  isDeepseekRateLimited,
  isDeepseekReasoningContentError,
  isDeepseekRetryable,
} from "../../../../../app/server/ai/core/deepseekTransientError.server";

describe("deepseekTransientError", () => {
  it("detects 429 concurrency", () => {
    expect(isDeepseekRateLimited(Object.assign(new Error("Rate limit"), { status: 429 }))).toBe(
      true,
    );
    expect(isDeepseekRateLimited(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(isDeepseekRetryable(new Error("429 concurrency exceeded"))).toBe(true);
  });

  it("detects missing reasoning_content", () => {
    expect(
      isDeepseekReasoningContentError(
        new Error("400 Missing reasoning_content in assistant message"),
      ),
    ).toBe(true);
    expect(isDeepseekRateLimited(new Error("400 Missing reasoning_content"))).toBe(false);
  });

  it("retries 5xx and socket drops", () => {
    expect(isDeepseekRetryable(Object.assign(new Error("boom"), { status: 503 }))).toBe(true);
    expect(isDeepseekRetryable(new Error("socket hang up"))).toBe(true);
    expect(isDeepseekRetryable(new Error("invalid json"))).toBe(false);
  });
});
