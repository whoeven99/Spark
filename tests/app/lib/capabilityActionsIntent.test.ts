import { describe, expect, it } from "vitest";
import { isCapabilityOverviewUserIntent } from "../../../app/lib/capabilityActionsIntent";

describe("isCapabilityOverviewUserIntent", () => {
  it("matches 你有什么功能", () => {
    expect(isCapabilityOverviewUserIntent("你有什么功能")).toBe(true);
  });

  it("matches wrapped workspace user message", () => {
    expect(
      isCapabilityOverviewUserIntent(
        "[工作台上下文]\n- 已选商品（共 0 个）\n\n[用户消息]\n有哪些功能",
      ),
    ).toBe(true);
  });

  it("matches english what can you do", () => {
    expect(isCapabilityOverviewUserIntent("What can you do?")).toBe(true);
  });

  it("rejects unrelated asks", () => {
    expect(isCapabilityOverviewUserIntent("帮我批量上下架")).toBe(false);
    expect(isCapabilityOverviewUserIntent("今日销售额")).toBe(false);
  });
});
