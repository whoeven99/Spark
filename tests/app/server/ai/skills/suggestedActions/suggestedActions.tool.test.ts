import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  SUGGEST_NEXT_ACTIONS_TOOL_NAME,
  resolveSuggestedActionsPayload,
} from "../../../../../../app/server/ai/skills/suggestedActions/suggestedActions.tool";

function aiToolCall(keys: unknown) {
  return new AIMessage({
    content: "",
    tool_calls: [
      { id: "call-1", name: SUGGEST_NEXT_ACTIONS_TOOL_NAME, args: { keys } },
    ],
  });
}

describe("resolveSuggestedActionsPayload", () => {
  it("reads the keys the model picked from its tool call", () => {
    expect(
      resolveSuggestedActionsPayload([aiToolCall(["qualityScore", "seoAudit"])]),
    ).toEqual({ keys: ["qualityScore", "seoAudit"] });
  });

  it("reads the keys back from the tool result message", () => {
    const messages = [
      new ToolMessage({
        tool_call_id: "call-1",
        name: SUGGEST_NEXT_ACTIONS_TOOL_NAME,
        content: JSON.stringify({ ok: true, keys: ["optimizeCopy"] }),
      }),
    ];
    expect(resolveSuggestedActionsPayload(messages)).toEqual({
      keys: ["optimizeCopy"],
    });
  });

  it("drops keys that are not real workspace actions", () => {
    expect(
      resolveSuggestedActionsPayload([aiToolCall(["seoAudit", "notAnAction"])]),
    ).toEqual({ keys: ["seoAudit"] });
    expect(resolveSuggestedActionsPayload([aiToolCall(["notAnAction"])])).toBeUndefined();
  });

  it("returns nothing when the model never called it", () => {
    expect(resolveSuggestedActionsPayload([])).toBeUndefined();
    expect(
      resolveSuggestedActionsPayload([new AIMessage({ content: "只是文字回复" })]),
    ).toBeUndefined();
  });
});
