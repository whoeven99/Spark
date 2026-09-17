import { describe, expect, it } from "vitest";
import {
  nextStickySkillFocus,
  resolveConversationSkillFocus,
} from "../../../app/lib/conversationSkillFocus";

describe("conversationSkillFocus", () => {
  it("uses only explicit focus for the request (sticky ignored)", () => {
    expect(
      resolveConversationSkillFocus({
        explicit: "seoAudit",
        sticky: "bulkPriceEdit",
      }),
    ).toBe("seoAudit");
    expect(
      resolveConversationSkillFocus({
        explicit: null,
        sticky: "seoAudit",
      }),
    ).toBeNull();
    expect(resolveConversationSkillFocus({ explicit: "  ", sticky: "seoAudit" })).toBeNull();
  });

  it("keeps sticky only when this turn is an explicit recommend; free input clears it", () => {
    expect(
      nextStickySkillFocus({
        explicit: "qualityScore",
        previous: "seoAudit",
      }),
    ).toBe("qualityScore");
    expect(
      nextStickySkillFocus({
        explicit: null,
        previous: "seoAudit",
      }),
    ).toBeNull();
  });
});
