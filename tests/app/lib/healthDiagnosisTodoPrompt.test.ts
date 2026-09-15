import { describe, expect, it } from "vitest";
import { formatHealthDiagnosisTodoPrompt } from "../../../app/lib/healthDiagnosisTodoPrompt";

describe("formatHealthDiagnosisTodoPrompt", () => {
  it("fills title, reason, actions, and related lines", () => {
    expect(
      formatHealthDiagnosisTodoPrompt(
        "{{title}} | {{reason}} | {{actions}} | {{related}}",
        {
          title: "处理超时单",
          triggerReason: "3 单超时",
          suggestedActions: ["从老到新发货"],
          relatedLines: ["#1042 · 超时 61 小时"],
        },
        "无建议",
        "无对象",
      ),
    ).toBe("处理超时单 | 3 单超时 | 从老到新发货 | #1042 · 超时 61 小时");
  });

  it("uses empty fallbacks", () => {
    expect(
      formatHealthDiagnosisTodoPrompt(
        "{{actions}} / {{related}}",
        {
          title: "x",
          triggerReason: "y",
          suggestedActions: [],
          relatedLines: [],
        },
        "无建议",
        "无对象",
      ),
    ).toBe("无建议 / 无对象");
  });
});
