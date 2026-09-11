import { describe, expect, it } from "vitest";
import { initI18n } from "../../../../../app/i18n";
import type { AITaskItem } from "../../../../../app/lib/aiTaskTypes";
import {
  buildTaskRow,
  resolveAiTypeLabel,
} from "../../../../../app/routes/component/taskListV2/taskRowModel";

function aiTask(overrides: Partial<AITaskItem> & Pick<AITaskItem, "taskType">): AITaskItem {
  return {
    id: "task-1",
    batchId: "batch-1",
    shop: "demo.myshopify.com",
    status: "pending_review",
    config: {},
    result: null,
    estimatedCredits: null,
    actualCredits: null,
    startedAt: "2026-09-11T00:00:00.000Z",
    completedAt: null,
    errorMsg: null,
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("taskRowModel i18n", () => {
  it("translates known and extra AI task types in Chinese", () => {
    const i18n = initI18n("zh-CN");
    const t = i18n.t.bind(i18n);
    expect(resolveAiTypeLabel("product_improve", t)).toBe("商品文案");
    expect(resolveAiTypeLabel("product_import", t)).toBe("导入商品");
    expect(resolveAiTypeLabel("product_export", t)).toBe("导出商品");
    expect(resolveAiTypeLabel("product_duplicate", t)).toBe("复制商品");
    expect(resolveAiTypeLabel("not_a_real_type", t)).toBe("其他任务");
  });

  it("does not show raw product_import as the row title", () => {
    const i18n = initI18n("zh-CN");
    const t = i18n.t.bind(i18n);
    const row = buildTaskRow(
      {
        entryType: "ai_task",
        task: aiTask({
          taskType: "product_import" as AITaskItem["taskType"],
          config: { title: "product_import" },
        }),
      },
      t,
    );
    expect(row.typeLabel).toBe("导入商品");
    expect(row.title).toBe("未命名任务");
    expect(row.title.includes("product_")).toBe(false);
  });

  it("keeps a real product name for copy tasks", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    const row = buildTaskRow(
      {
        entryType: "ai_task",
        task: aiTask({
          taskType: "product_improve",
          config: { originalTitle: "Winter Boots" },
        }),
      },
      t,
    );
    expect(row.typeLabel).toBe("Product copy");
    expect(row.title).toBe("Winter Boots");
  });
});
