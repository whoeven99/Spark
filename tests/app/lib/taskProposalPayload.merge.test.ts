import { describe, expect, it } from "vitest";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  mergeTaskProposalTargets,
  type TaskProposalPayload,
} from "../../../app/lib/taskProposalPayload";

function baseProposal(
  overrides: Partial<TaskProposalPayload> = {},
): TaskProposalPayload {
  return {
    version: 1,
    proposalId: "tp-test",
    skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID,
    title: "批量生成商品描述",
    summary: "",
    targets: {
      kind: "products",
      items: [{ id: "gid://shopify/Product/1", title: "旧商品", imageUrl: null }],
    },
    params: [],
    ...overrides,
  };
}

describe("mergeTaskProposalTargets", () => {
  it("keeps proposal items by default even when context differs", () => {
    const merged = mergeTaskProposalTargets(baseProposal(), [
      { id: "gid://shopify/Product/2", title: "新商品", imageUrl: null },
    ]);
    expect(merged.targets.items.map((i) => i.id)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });

  it("prefers context products after user change (preferContext)", () => {
    const merged = mergeTaskProposalTargets(
      baseProposal(),
      [{ id: "gid://shopify/Product/2", title: "新商品", imageUrl: "https://x/a.jpg" }],
      null,
      { preferContext: true },
    );
    expect(merged.targets.items).toEqual([
      {
        id: "gid://shopify/Product/2",
        title: "新商品",
        imageUrl: "https://x/a.jpg",
      },
    ]);
    expect(merged.targets.query).toBeUndefined();
  });

  it("clears proposal items when preferContext and context is empty", () => {
    const merged = mergeTaskProposalTargets(baseProposal(), [], null, {
      preferContext: true,
    });
    expect(merged.targets.items).toEqual([]);
    expect(merged.targets.query).toBeUndefined();
  });

  it("marks picture-translate products without image as disabled", () => {
    const merged = mergeTaskProposalTargets(
      baseProposal({
        skillId: BATCH_PICTURE_TRANSLATE_SKILL_ID,
        targets: { kind: "products", items: [] },
      }),
      [{ id: "gid://shopify/Product/3", title: "无图", imageUrl: null }],
    );
    expect(merged.targets.items[0]?.disabledReason).toBe("no_primary_image");
  });
});
