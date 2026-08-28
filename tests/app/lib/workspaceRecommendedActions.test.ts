import { describe, expect, it } from "vitest";
import { buildWorkspaceRecommendedGroups } from "../../../app/lib/workspaceRecommendedActions";

const LABELS: Record<string, string> = {
  "workspace.shell.chat.recommend.groupOperations": "经营诊断",
  "workspace.shell.chat.recommend.groupProduct": "商品优化",
  "workspace.shell.chat.recommend.groupImage": "图片生成",
  "workspace.shell.chat.recommend.todayOverview.label": "今日经营概况",
  "workspace.shell.chat.recommend.todayOverview.prompt": "overview-prompt",
  "workspace.shell.chat.recommend.todayTodos.label": "今日待办与风险",
  "workspace.shell.chat.recommend.todayTodos.prompt": "todos-prompt",
  "workspace.shell.chat.recommend.inventoryHealth.label": "库存健康检查",
  "workspace.shell.chat.recommend.inventoryHealth.prompt": "inventory-prompt",
  "workspace.shell.chat.recommend.abandonRefund.label": "弃购与退款排查",
  "workspace.shell.chat.recommend.abandonRefund.prompt": "abandon-prompt",
  "workspace.shell.chat.recommend.qualityScore.label": "商品页质量评分",
  "workspace.shell.chat.recommend.qualityScore.prompt.shop": "score-shop",
  "workspace.shell.chat.recommend.qualityScore.prompt.selected": "score-selected",
  "workspace.shell.chat.recommend.optimizeCopy.label": "优化商品文案",
  "workspace.shell.chat.recommend.optimizeCopy.prompt.shop": "copy-shop",
  "workspace.shell.chat.recommend.optimizeCopy.prompt.selected": "copy-selected",
  "workspace.shell.chat.recommend.translateImage.label": "翻译商品图文字",
  "workspace.shell.chat.recommend.translateImage.prompt.shop": "translate-shop",
  "workspace.shell.chat.recommend.translateImage.prompt.selected": "translate-selected",
  "workspace.shell.chat.recommend.generateImage.label": "生成商品主图",
  "workspace.shell.chat.recommend.generateImage.prompt": "generate-prompt",
};

function t(key: string): string {
  return LABELS[key] ?? key;
}

describe("buildWorkspaceRecommendedGroups", () => {
  it("returns 8 shop-scoped actions in operations-first order", () => {
    const groups = buildWorkspaceRecommendedGroups(t, false);
    expect(groups.map((g) => g.key)).toEqual([
      "operations",
      "productOptimization",
      "imageGeneration",
    ]);
    const items = groups.flatMap((g) => g.items);
    expect(items).toHaveLength(8);
    expect(items.find((i) => i.key === "optimizeCopy")?.prompt).toBe("copy-shop");
    expect(items.filter((i) => i.createsTask)).toHaveLength(4);
  });

  it("prioritizes product actions and switches to selected prompts", () => {
    const groups = buildWorkspaceRecommendedGroups(t, true);
    expect(groups.map((g) => g.key)).toEqual([
      "productOptimization",
      "imageGeneration",
      "operations",
    ]);
    expect(groups[0].items.find((i) => i.key === "optimizeCopy")?.prompt).toBe(
      "copy-selected",
    );
  });
});
