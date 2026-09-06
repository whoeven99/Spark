import { describe, expect, it } from "vitest";
import {
  nextStickySkillFocus,
  resolveConversationSkillFocus,
} from "../../../app/lib/conversationSkillFocus";

describe("conversationSkillFocus", () => {
  it("prefers explicit focus over sticky for the request", () => {
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
    ).toBe("seoAudit");
    expect(resolveConversationSkillFocus({ explicit: "  ", sticky: "seoAudit" })).toBe(
      "seoAudit",
    );
  });

  it("updates sticky only when explicit is present", () => {
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
    ).toBe("seoAudit");
  });
});
