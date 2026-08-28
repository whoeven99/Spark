import { describe, expect, it } from "vitest";
import {
  IMAGE_GENERATION_SKILL_ID,
  buildImageGenerationProposal,
  coerceTaskProposalPayload,
  mergeTaskProposalTargets,
} from "../../../app/lib/taskProposalPayload";

describe("buildImageGenerationProposal", () => {
  it("uses kind=none and textarea description when no product is provided", () => {
    const proposal = buildImageGenerationProposal({
      description: "海边冲浪服主图",
    });
    expect(proposal.skillId).toBe(IMAGE_GENERATION_SKILL_ID);
    expect(proposal.targets).toEqual({ kind: "none", items: [] });
    expect(proposal.params).toEqual([
      expect.objectContaining({
        key: "description",
        type: "textarea",
        value: "海边冲浪服主图",
      }),
    ]);
  });

  it("puts a single reference product into targets", () => {
    const proposal = buildImageGenerationProposal({
      description: "白底主图",
      productId: "gid://shopify/Product/1",
      productTitle: "冲浪服",
    });
    expect(proposal.targets).toEqual({
      kind: "products",
      items: [{ id: "gid://shopify/Product/1", title: "冲浪服", imageUrl: null }],
    });
  });
});

describe("mergeTaskProposalTargets image_generation", () => {
  it("fills only the first workspace product when the proposal has none", () => {
    const proposal = buildImageGenerationProposal({ description: "场景图" });
    const merged = mergeTaskProposalTargets(proposal, [
      { id: "gid://shopify/Product/1", title: "A", imageUrl: "https://cdn/a.jpg" },
      { id: "gid://shopify/Product/2", title: "B" },
    ]);
    expect(merged.targets).toEqual({
      kind: "products",
      items: [
        {
          id: "gid://shopify/Product/1",
          title: "A",
          imageUrl: "https://cdn/a.jpg",
        },
      ],
    });
  });

  it("does not overwrite a tool-prefilled product", () => {
    const proposal = buildImageGenerationProposal({
      description: "场景图",
      productId: "gid://shopify/Product/9",
      productTitle: "已选",
    });
    const merged = mergeTaskProposalTargets(proposal, [
      { id: "gid://shopify/Product/1", title: "A" },
    ]);
    expect(merged.targets.items).toEqual([
      { id: "gid://shopify/Product/9", title: "已选", imageUrl: null },
    ]);
  });
});

describe("coerceTaskProposalPayload textarea", () => {
  it("keeps textarea type and multiline description", () => {
    const proposal = buildImageGenerationProposal({
      description: "第一行\n第二行",
    });
    const roundTrip = coerceTaskProposalPayload(proposal);
    expect(roundTrip?.params[0]).toEqual(
      expect.objectContaining({
        type: "textarea",
        value: "第一行\n第二行",
      }),
    );
  });
});
