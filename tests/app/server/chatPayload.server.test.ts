import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  parseClientChatMessages,
  trimMessagesToTokenBudget,
} from "../../../app/server/chatPayload.server";

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

  it("keeps more than 36 turns when under the 1M budget", () => {
    const raw = Array.from({ length: 80 }, (_, i) =>
      i % 2 === 0
        ? { role: "user" as const, content: `问 ${i}` }
        : { role: "assistant" as const, content: `答 ${i}` },
    );
    raw.push({ role: "user", content: "最后一句" });
    const r = parseClientChatMessages(raw);
    expect(r).toHaveLength(81);
    expect(HumanMessage.isInstance(r![r!.length - 1])).toBe(true);
  });

  it("trims oldest messages to stay under a token budget", () => {
    const messages = [
      new HumanMessage("aaaa".repeat(200)),
      new AIMessage("bbbb".repeat(200)),
      new HumanMessage("最新问题"),
    ];
    const trimmed = trimMessagesToTokenBudget(messages, 80);
    expect(trimmed.length).toBeLessThan(messages.length);
    expect(HumanMessage.isInstance(trimmed[trimmed.length - 1])).toBe(true);
    expect(String(trimmed[trimmed.length - 1].content)).toContain("最新问题");
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
