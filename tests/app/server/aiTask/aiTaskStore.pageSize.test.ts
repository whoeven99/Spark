import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/db.server", () => ({
  default: {
    aITask: {
      count: (...args: unknown[]) => count(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

vi.mock("../../../../app/server/imageGeneration/imageGenerationBlob.server", () => ({
  getGeneratedImageReadUrl: () => "https://example.com/image",
}));

vi.mock("../../../../app/server/pictureTranslate/pictureTranslateBlob.server", () => ({
  getPictureTranslateResultImageUrl: () => "https://example.com/translated",
}));

import {
  AI_TASK_VIEW_FETCH_LIMIT,
  listTasksPageForShop,
  normalizeAiTaskPageSize,
} from "../../../../app/server/aiTask/aiTaskStore.server";

describe("normalizeAiTaskPageSize", () => {
  it("keeps paginated task lists capped at 20", () => {
    expect(normalizeAiTaskPageSize(200)).toBe(20);
  });

  it("allows unified merge queries to fetch up to 200", () => {
    expect(normalizeAiTaskPageSize(200, 200)).toBe(200);
    expect(normalizeAiTaskPageSize(AI_TASK_VIEW_FETCH_LIMIT, AI_TASK_VIEW_FETCH_LIMIT)).toBe(
      AI_TASK_VIEW_FETCH_LIMIT,
    );
  });

  it("still hard-caps above the unified fetch limit", () => {
    expect(normalizeAiTaskPageSize(500, 500)).toBe(AI_TASK_VIEW_FETCH_LIMIT);
  });
});

describe("listTasksPageForShop maxPageSize", () => {
  beforeEach(() => {
    count.mockReset();
    findMany.mockReset();
    count.mockResolvedValue(93);
    findMany.mockResolvedValue([]);
  });

  it("does not silently clamp unified history fetches to 20", async () => {
    await listTasksPageForShop({
      shop: "demo.myshopify.com",
      view: "history",
      page: 1,
      pageSize: AI_TASK_VIEW_FETCH_LIMIT,
      maxPageSize: AI_TASK_VIEW_FETCH_LIMIT,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        skip: 0,
      }),
    );
  });

  it("keeps the default page API at 20", async () => {
    await listTasksPageForShop({
      shop: "demo.myshopify.com",
      view: "history",
      page: 1,
      pageSize: 200,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        skip: 0,
      }),
    );
  });
});
