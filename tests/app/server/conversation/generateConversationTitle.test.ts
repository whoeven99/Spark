import { describe, expect, it } from "vitest";
import {
  CONVERSATION_TITLE_MAX_CHARS,
  fallbackConversationTitle,
  sanitizeConversationTitle,
} from "../../../../app/server/conversation/generateConversationTitle.server";

describe("sanitizeConversationTitle", () => {
  it("strips quotes and title labels", () => {
    expect(sanitizeConversationTitle('"功能介绍"')).toBe("功能介绍");
    expect(sanitizeConversationTitle("标题：优化商品文案")).toBe("优化商品文案");
    expect(sanitizeConversationTitle("Title: Optimize product copy")).toBe(
      "Optimize product copy",
    );
  });

  it("keeps only the first line and trims trailing punctuation", () => {
    expect(sanitizeConversationTitle("库存排查。\n第二行")).toBe("库存排查");
  });

  it("truncates long titles", () => {
    const long = "这是一个非常非常非常非常非常非常非常非常非常长的对话标题内容啊";
    const result = sanitizeConversationTitle(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(CONVERSATION_TITLE_MAX_CHARS);
    expect(result!.endsWith("…")).toBe(true);
  });

  it("returns null for empty output", () => {
    expect(sanitizeConversationTitle("   ")).toBeNull();
    expect(sanitizeConversationTitle('""')).toBeNull();
  });
});

describe("fallbackConversationTitle", () => {
  it("returns default for empty text", () => {
    expect(fallbackConversationTitle("")).toBe("新对话");
  });

  it("returns short text as-is", () => {
    expect(fallbackConversationTitle("你有什么功能")).toBe("你有什么功能");
  });

  it("truncates long text", () => {
    const long = "a".repeat(CONVERSATION_TITLE_MAX_CHARS + 10);
    const result = fallbackConversationTitle(long);
    expect(result.length).toBe(CONVERSATION_TITLE_MAX_CHARS);
    expect(result.endsWith("…")).toBe(true);
  });
});
