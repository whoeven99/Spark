import { describe, expect, it } from "vitest";
import { buildWorkspaceRecommendedGroups } from "../../../app/lib/workspaceRecommendedActions";
import {
  filterWorkspaceRecommendedGroups,
  parseWorkspaceActionsPayload,
  resolveWorkspaceActionsForTurn,
  selectSuggestedActionKeys,
  workspaceActionsRelatedKeys,
} from "../../../app/lib/workspaceSuggestedActions";

describe("selectSuggestedActionKeys", () => {
  it("filters casual store asks to ops-related actions", () => {
    expect(selectSuggestedActionKeys("我的店铺目前怎么样")).toEqual([
      "todayPulse",
      "seoAudit",
    ]);
    expect(selectSuggestedActionKeys("今天店里怎么样")).toEqual([
      "todayPulse",
      "seoAudit",
    ]);
  });

  it("suggests ops + copy actions for vague growth asks", () => {
    expect(selectSuggestedActionKeys("怎么才能多卖一点")).toEqual([
      "todayPulse",
      "seoAudit",
      "optimizeCopy",
    ]);
    expect(selectSuggestedActionKeys("sell more")).toEqual([
      "todayPulse",
      "seoAudit",
      "optimizeCopy",
    ]);
  });

  it("offers the product-optimization group when the ask spans several paths", () => {
    expect(selectSuggestedActionKeys("我想让商品页面更好一点")).toEqual([
      "qualityScore",
      "optimizeCopy",
      "translateImage",
    ]);
  });

  it("maps explicit intents and does not leak unrelated keys", () => {
    expect(selectSuggestedActionKeys("帮我批量调价降价 10%")).toEqual(["bulkPriceEdit"]);
    expect(selectSuggestedActionKeys("打开今日健康诊断")).toEqual(["todayPulse"]);
    expect(selectSuggestedActionKeys("今天天气怎么样")).toEqual([]);
  });
});

describe("resolveWorkspaceActionsForTurn", () => {
  it("returns full catalog for capability discovery", () => {
    expect(resolveWorkspaceActionsForTurn({ userText: "你有什么功能" })).toBe(true);
  });

  it("skips chips when a card already opened or this turn is a recommend click", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "我的店铺目前怎么样",
        cardOpened: true,
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "帮我批量调价",
        skillFocus: "bulkPriceEdit",
      }),
    ).toBeNull();
  });

  it("returns filtered keys for advice asks", () => {
    expect(
      resolveWorkspaceActionsForTurn({ userText: "我的店铺目前怎么样" }),
    ).toEqual({ keys: ["todayPulse", "seoAudit"] });
  });

  it("prefers the keys the model picked over keyword matching", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        // 话术撞不到任何 pattern，靠模型给方向
        userText: "我对店铺目前有什么值得优化的",
        modelPicked: { keys: ["qualityScore", "seoAudit"] },
      }),
    ).toEqual({ keys: ["qualityScore", "seoAudit"] });
  });

  it("demotes keyword matches the model did not pick to relatedKeys", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "我的店铺目前怎么样",
        modelPicked: { keys: ["qualityScore"] },
      }),
    ).toEqual({ keys: ["qualityScore"], relatedKeys: ["todayPulse", "seoAudit"] });
  });

  it("does not repeat a model-picked key under relatedKeys", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "我的店铺目前怎么样",
        modelPicked: { keys: ["todayPulse", "seoAudit"] },
      }),
    ).toEqual({ keys: ["todayPulse", "seoAudit"] });
  });

  it("still drops the model's keys once a card opened", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "帮我把这批商品降价 10%",
        modelPicked: { keys: ["bulkPriceEdit"] },
        cardOpened: true,
      }),
    ).toBeNull();
  });

  it("keeps the full catalog for discovery even if the model picked a few", () => {
    expect(
      resolveWorkspaceActionsForTurn({
        userText: "你有什么功能",
        modelPicked: { keys: ["seoAudit"] },
      }),
    ).toBe(true);
  });
});

describe("parseWorkspaceActionsPayload / filter groups", () => {
  it("keeps boolean true as all-catalog", () => {
    expect(parseWorkspaceActionsPayload(true)).toBe(true);
    expect(parseWorkspaceActionsPayload({ keys: ["bulkPriceEdit", "nope"] })).toEqual({
      keys: ["bulkPriceEdit"],
    });
  });

  it("round-trips relatedKeys and drops ones already in keys", () => {
    expect(
      parseWorkspaceActionsPayload({
        keys: ["qualityScore"],
        relatedKeys: ["qualityScore", "seoAudit", "nope"],
      }),
    ).toEqual({ keys: ["qualityScore"], relatedKeys: ["seoAudit"] });
    expect(workspaceActionsRelatedKeys({ keys: ["qualityScore"] })).toEqual([]);
    expect(workspaceActionsRelatedKeys(true)).toEqual([]);
  });

  it("filters recommend groups to related keys", () => {
    const groups = filterWorkspaceRecommendedGroups(
      buildWorkspaceRecommendedGroups((key) => key, false),
      ["todayPulse", "seoAudit"],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(["todayPulse", "seoAudit"]);
  });
});
