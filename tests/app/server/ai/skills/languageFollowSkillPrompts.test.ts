import { describe, expect, it } from "vitest";
import { pictureTranslateFormToolDefinition } from "~/server/ai/skills/pictureTranslate/pictureTranslate.form.skill";
import { pictureTranslateToolDefinition } from "~/server/ai/skills/pictureTranslate/pictureTranslate.tool";
import { productOptimizationSkills } from "~/server/ai/skills/productOptimization";

function findSkillPrompt(name: string): string {
  const def = productOptimizationSkills.find((item) => item.name === name);
  expect(def?.systemPromptExtension).toBeTypeOf("string");
  return String(def?.systemPromptExtension);
}

describe("skill prompt language following", () => {
  it("requires picture translate form replies to follow the user's language", () => {
    expect(pictureTranslateFormToolDefinition.systemPromptExtension).toContain(
      "与用户消息相同的语言",
    );
    expect(pictureTranslateFormToolDefinition.systemPromptExtension).toContain(
      "不要固定使用中文",
    );
  });

  it("requires picture translate execution replies to follow the user's language", () => {
    expect(pictureTranslateToolDefinition.systemPromptExtension).toContain(
      "与用户消息相同的语言",
    );
  });

  it("keeps product improve and quality prompts language-neutral", () => {
    const productImprovePrompt = findSkillPrompt("productImprove");
    const productQualityPrompt = findSkillPrompt("productQualityScore");

    expect(productImprovePrompt).toContain("与用户消息相同的语言");
    expect(productImprovePrompt).not.toContain("简洁中文概括");

    expect(productQualityPrompt).toContain("与用户消息相同的语言");
    expect(productQualityPrompt).not.toContain("简洁中文概括");
  });
});
