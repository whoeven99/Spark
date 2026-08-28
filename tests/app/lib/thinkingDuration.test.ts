import { describe, expect, it } from "vitest";
import { initI18n } from "../../../app/i18n";
import { formatThinkingDuration } from "../../../app/lib/thinkingDuration";

describe("formatThinkingDuration", () => {
  it("formats seconds and minutes in English", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(t("workspace.shell.chat.thinking.done")).toBe("Finished thinking");
    expect(t("workspace.shell.chat.thinking.elapsed", { duration: "12s" })).toBe("Took 12s");
    expect(formatThinkingDuration(0, t)).toBe("0s");
    expect(formatThinkingDuration(12_400, t)).toBe("12s");
    expect(formatThinkingDuration(65_000, t)).toBe("1m 5s");
  });

  it("formats seconds and minutes in Chinese", () => {
    const i18n = initI18n("zh-CN");
    const t = i18n.t.bind(i18n);
    expect(t("workspace.shell.chat.thinking.done")).toBe("已深度思考");
    expect(t("workspace.shell.chat.thinking.elapsed", { duration: "12 秒" })).toBe("用时 12 秒");
    expect(formatThinkingDuration(12_400, t)).toBe("12 秒");
    expect(formatThinkingDuration(65_000, t)).toBe("1 分 5 秒");
  });
});
