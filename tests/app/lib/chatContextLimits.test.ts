import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_MAX_OUTPUT_TOKENS,
  DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
  formatContextTokenCount,
  resolveChatMaxOutputTokens,
} from "../../../app/lib/chatContextLimits";

describe("chatContextLimits", () => {
  it("formats 1M context for the indicator", () => {
    expect(formatContextTokenCount(1_000_000)).toBe("1M");
    expect(formatContextTokenCount(1_500_000)).toBe("1.5M");
    expect(formatContextTokenCount(8000)).toBe("8.0K");
  });

  it("defaults output tokens high enough for thinking", () => {
    expect(resolveChatMaxOutputTokens(undefined)).toBe(
      DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
    );
    expect(resolveChatMaxOutputTokens("4096")).toBe(4096);
    expect(resolveChatMaxOutputTokens("999999")).toBe(DEEPSEEK_MAX_OUTPUT_TOKENS);
  });
});
