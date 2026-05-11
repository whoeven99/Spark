import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { extractMessageText, extractMessagesContext } from "./langchainMessageText";

describe("extractMessageText", () => {
  it("字符串 content 原样返回", () => {
    const msg = new HumanMessage("你好");
    expect(extractMessageText(msg)).toBe("你好");
  });

  it("数组 content 拼接含 text 字段的块", () => {
    const msg = new AIMessage({
      content: [
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ],
    });
    expect(extractMessageText(msg)).toBe("AB");
  });

  it("数组中的纯字符串块保留", () => {
    const msg = new HumanMessage({
      content: ["x", "y"],
    });
    expect(extractMessageText(msg)).toBe("xy");
  });

  it("无法识别的块输出空字符串", () => {
    const msg = new AIMessage({
      content: [{ type: "image_url", image_url: "http://example.com/x.png" }],
    });
    expect(extractMessageText(msg)).toBe("");
  });

  it("空 HumanMessage 返回空字符串", () => {
    expect(extractMessageText(new HumanMessage(""))).toBe("");
  });
});

describe("extractMessagesContext", () => {
  it("跳过空文本并拼接", () => {
    const ctx = extractMessagesContext([
      new HumanMessage("问题"),
      new AIMessage(""),
      new AIMessage("答案片段"),
    ]);
    expect(ctx).toBe("问题\n\n答案片段");
  });

  it("总长截断到 4000 字符", () => {
    const long = "x".repeat(2500);
    const ctx = extractMessagesContext([
      new HumanMessage(long),
      new AIMessage(long),
    ]);
    expect(ctx.length).toBe(4000);
    expect(ctx.startsWith("x".repeat(2500))).toBe(true);
  });
});
