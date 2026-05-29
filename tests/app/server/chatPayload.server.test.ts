import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { parseClientChatMessages } from "../../../app/server/chatPayload.server";

describe("parseClientChatMessages", () => {
  it("accepts assistant preamble followed by user", () => {
    const r = parseClientChatMessages([
      { role: "assistant", content: "你好" },
      { role: "user", content: "帮我看销售额" },
    ]);
    expect(r).toHaveLength(2);
    expect(AIMessage.isInstance(r![0])).toBe(true);
    expect(HumanMessage.isInstance(r![1])).toBe(true);
  });

  it("rejects when last message is not user", () => {
    expect(
      parseClientChatMessages([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
    ).toBeNull();
  });

  it("rejects empty array", () => {
    expect(parseClientChatMessages([])).toBeNull();
  });

  it("skips blank segments; trailing user still valid", () => {
    const r = parseClientChatMessages([
      { role: "assistant", content: " " },
      { role: "user", content: "x" },
    ]);
    expect(r).toHaveLength(1);
    expect(HumanMessage.isInstance(r![0])).toBe(true);
  });
});
