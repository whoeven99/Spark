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
    const active = selectActiveGatedSkills({ skillFocus: "generateImage" });
    for (const name of ["shopOperations", "shopifyShopBasicInfo", "currentTime", "productSearch"]) {
      expect(shouldBindSkillForTurn(name, active)).toBe(true);
    }
  });

  it("free input (no skillFocus) binds all gated skills for the model to choose", () => {
    const idle = selectActiveGatedSkills({
      skillFocus: null,
      recentUserText: "今天天气如何",
    });
    expect(idle).toBe("all");
    expect(shouldBindSkillForTurn("bulkPriceEdit", idle)).toBe(true);
    expect(shouldBindSkillForTurn("productImport", idle)).toBe(true);
    expect(shouldBindSkillForTurn("imageGeneration", idle)).toBe(true);

    const priceWording = selectActiveGatedSkills({
      skillFocus: null,
      recentUserText: "帮我批量调价降价 10%",
    });
    expect(priceWording).toBe("all");
    expect(shouldBindSkillForTurn("bulkPriceEdit", priceWording)).toBe(true);
    expect(shouldBindSkillForTurn("imageGeneration", priceWording)).toBe(true);
  });

  it("explicit skillFocus trims other gated skills", () => {
    const active = selectActiveGatedSkills({ skillFocus: "generateImage" });
    expect(active).not.toBe("all");
    expect(shouldBindSkillForTurn("imageGeneration", active)).toBe(true);
    expect(shouldBindSkillForTurn("imageGenerationForm", active)).toBe(true);
    expect(shouldBindSkillForTurn("bulkPriceEdit", active)).toBe(false);
    expect(shouldBindSkillForTurn("productImport", active)).toBe(false);
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
