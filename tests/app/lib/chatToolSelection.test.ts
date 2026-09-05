import { afterEach, describe, expect, it } from "vitest";
import {
  isChatToolTrimEnabled,
  selectActiveGatedSkills,
  shouldBindSkillForTurn,
  TURN_GATED_SKILL_NAMES,
} from "../../../app/lib/chatToolSelection";

describe("chatToolSelection", () => {
  const originalTrim = process.env.CHAT_TOOL_TRIM;
  afterEach(() => {
    if (originalTrim === undefined) delete process.env.CHAT_TOOL_TRIM;
    else process.env.CHAT_TOOL_TRIM = originalTrim;
  });

  it("keeps non-gated (通用/系统/目录) skills bound regardless of intent", () => {
    const active = selectActiveGatedSkills({ skillFocus: null, userText: "" });
    for (const name of ["shopOperations", "shopifyShopBasicInfo", "currentTime", "productSearch"]) {
      expect(shouldBindSkillForTurn(name, active)).toBe(true);
    }
  });

  it("gates heavy skills until intent matches", () => {
    const idle = selectActiveGatedSkills({ skillFocus: null, recentUserText: "今天天气如何" });
    expect(shouldBindSkillForTurn("bulkPriceEdit", idle)).toBe(false);
    expect(shouldBindSkillForTurn("imageGeneration", idle)).toBe(false);

    const priceIntent = selectActiveGatedSkills({
      skillFocus: null,
      recentUserText: "帮我批量调价降价 10%",
    });
    expect(shouldBindSkillForTurn("bulkPriceEdit", priceIntent)).toBe(true);
    expect(shouldBindSkillForTurn("imageGeneration", priceIntent)).toBe(false);
  });

  it("binds gated skill via explicit skillFocus", () => {
    const active = selectActiveGatedSkills({ skillFocus: "generateImage", recentUserText: "" });
    expect(shouldBindSkillForTurn("imageGeneration", active)).toBe(true);
    expect(shouldBindSkillForTurn("imageGenerationForm", active)).toBe(true);
  });

  it("skillFocus=all disables trimming", () => {
    const active = selectActiveGatedSkills({ skillFocus: "all" });
    expect(active).toBe("all");
    for (const name of TURN_GATED_SKILL_NAMES) {
      expect(shouldBindSkillForTurn(name, active)).toBe(true);
    }
  });

  it("respects CHAT_TOOL_TRIM kill switch", () => {
    process.env.CHAT_TOOL_TRIM = "false";
    expect(isChatToolTrimEnabled()).toBe(false);
    delete process.env.CHAT_TOOL_TRIM;
    expect(isChatToolTrimEnabled()).toBe(true);
  });
});
