import { describe, expect, it } from "vitest";
import {
  buildProductImprovePath,
  isProductImproveTaskOpen,
  readProductImproveTabFromSearch,
  readProductImproveTaskIdFromSearch,
  resolveProductImproveOpenPath,
  shouldOpenInPageReview,
} from "../../../app/lib/productImproveDeepLink";

describe("productImproveDeepLink", () => {
  it("builds task list and review paths", () => {
    expect(buildProductImprovePath({ tab: "tasks" })).toBe(
      "/app/studio/copy?tab=tasks",
    );
    expect(buildProductImprovePath({ tab: "config" })).toBe("/app/studio/copy");
    expect(buildProductImprovePath({ taskId: "abc" })).toBe(
      "/app/studio/copy?tab=tasks&taskId=abc",
    );
  });

  it("reads tab and taskId from search, treating taskId as tasks tab", () => {
    expect(readProductImproveTabFromSearch("?host=x")).toBe("config");
    expect(readProductImproveTabFromSearch("?tab=tasks")).toBe("tasks");
    expect(readProductImproveTabFromSearch("?taskId=abc")).toBe("tasks");
    expect(readProductImproveTaskIdFromSearch("?tab=tasks&taskId=abc")).toBe(
      "abc",
    );
    expect(readProductImproveTaskIdFromSearch("?tab=tasks")).toBeNull();
  });

  it("opens review when intent is not list and taskId exists", () => {
    expect(
      resolveProductImproveOpenPath({
        taskType: "product_improve",
        taskId: "t1",
        intent: "review",
      }),
    ).toBe("/app/studio/copy?tab=tasks&taskId=t1");
    expect(
      resolveProductImproveOpenPath({
        skillId: "batch_product_improve",
        intent: "list",
      }),
    ).toBe("/app/studio/copy?tab=tasks");
    expect(
      resolveProductImproveOpenPath({
        taskType: "product_improve",
        intent: "review",
      }),
    ).toBe("/app/studio/copy?tab=tasks");
  });

  it("opens in-page review only when intent is review and taskId exists", () => {
    expect(
      shouldOpenInPageReview({
        taskType: "product_improve",
        taskId: "t1",
        intent: "review",
      }),
    ).toBe(true);
    expect(
      shouldOpenInPageReview({
        taskType: "product_improve",
        intent: "review",
      }),
    ).toBe(false);
    expect(
      shouldOpenInPageReview({
        taskType: "product_improve",
        taskId: "t1",
        intent: "list",
      }),
    ).toBe(false);
    expect(
      shouldOpenInPageReview({
        taskType: "image_generation",
        taskId: "t1",
        intent: "review",
      }),
    ).toBe(false);
    expect(shouldOpenInPageReview()).toBe(false);
  });

  it("detects product copy open targets", () => {
    expect(isProductImproveTaskOpen()).toBe(false);
    expect(isProductImproveTaskOpen({ taskType: "image_generation" })).toBe(
      false,
    );
    expect(isProductImproveTaskOpen({ taskType: "product_improve" })).toBe(true);
    expect(
      isProductImproveTaskOpen({ skillId: "batch_product_improve" }),
    ).toBe(true);
  });
});
