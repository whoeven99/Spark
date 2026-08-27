import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationTaskView } from "../../../app/server/operations/dailyInspection.server";

const authenticateAdmin = vi.fn();
const getOperationTaskByIdForShop = vi.fn();
const ensureDailySnapshot = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    admin: authenticateAdmin,
  },
}));

vi.mock("../../../app/server/operations/dailyInspection.server", () => ({
  getOperationTaskByIdForShop,
  ensureDailySnapshot,
}));

const { loader } = await import("../../../app/routes/app.today.diagnosis");

function createTask(overrides: Partial<OperationTaskView> = {}): OperationTaskView {
  return {
    id: "task_1",
    dedupeKey: "inventory_risk:risk_skus:inventory_loss:today",
    sourceKey: "inventory_risk",
    sourceType: "rule",
    title: "补货止损",
    quadrant: "q1",
    priority: "P0",
    status: "open",
    triggerReason: "库存风险上升",
    objective: null,
    impactMetrics: [],
    estimatedLift: null,
    roiImpactSummary: null,
    confidence: "high",
    riskEnvironment: "库存",
    aiContextPayload: null,
    relatedObjects: {},
    suggestedActions: ["按预估损失排序补货"],
    ownerRole: "供应链",
    dueWindow: "today",
    dueAt: null,
    createdAt: "2026-08-18T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

async function expectRedirectLocation(request: Request, expectedLocation: string) {
  try {
    await loader({ request } as never);
    throw new Error("expected redirect response");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(expectedLocation);
  }
}

describe("legacy /app/today/diagnosis task redirect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    authenticateAdmin.mockReset();
    getOperationTaskByIdForShop.mockReset();
    ensureDailySnapshot.mockReset();
    authenticateAdmin.mockResolvedValue({
      session: { shop: "spark-test.myshopify.com" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects history tasks to the history tab without running daily snapshot", async () => {
    getOperationTaskByIdForShop.mockResolvedValue(
      createTask({
        status: "done",
        resolvedAt: "2026-08-22T12:00:00.000Z",
      }),
    );

    const request = new Request(
      "https://example.com/app/today/diagnosis?detail=task&taskId=task_1&returnTo=%2Fapp%2Ftoday",
    );

    await expectRedirectLocation(
      request,
      "/app/tasks?taskId=task_1&returnTo=%2Fapp%2Ftoday&unifiedView=history",
    );
    expect(getOperationTaskByIdForShop).toHaveBeenCalledWith(
      "spark-test.myshopify.com",
      "task_1",
    );
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });

  it("keeps open tasks on the current tab", async () => {
    getOperationTaskByIdForShop.mockResolvedValue(createTask({ status: "open" }));

    const request = new Request(
      "https://example.com/app/today/diagnosis?detail=task&taskId=task_1",
    );

    await expectRedirectLocation(request, "/app/tasks?taskId=task_1");
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });

  it("keeps recently closed tasks on the current tab", async () => {
    getOperationTaskByIdForShop.mockResolvedValue(
      createTask({
        status: "done",
        resolvedAt: "2026-08-25T06:00:00.000Z",
      }),
    );

    const request = new Request(
      "https://example.com/app/today/diagnosis?detail=task&taskId=task_1",
    );

    await expectRedirectLocation(request, "/app/tasks?taskId=task_1");
  });

  it("redirects without tab hint when the task cannot be found", async () => {
    getOperationTaskByIdForShop.mockResolvedValue(null);

    const request = new Request(
      "https://example.com/app/today/diagnosis?detail=task&taskId=missing_task",
    );

    await expectRedirectLocation(request, "/app/tasks?taskId=missing_task");
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });

  it("redirects without lookup when taskId is missing", async () => {
    const request = new Request("https://example.com/app/today/diagnosis?detail=task");

    await expectRedirectLocation(request, "/app/tasks");
    expect(getOperationTaskByIdForShop).not.toHaveBeenCalled();
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });

  it("still redirects when task lookup fails", async () => {
    getOperationTaskByIdForShop.mockRejectedValue(new Error("db unavailable"));

    const request = new Request(
      "https://example.com/app/today/diagnosis?detail=task&taskId=task_1",
    );

    await expectRedirectLocation(request, "/app/tasks?taskId=task_1");
    expect(ensureDailySnapshot).not.toHaveBeenCalled();
  });
});

describe("legacy /app/today/diagnosis value redirect", () => {
  beforeEach(() => {
    authenticateAdmin.mockReset();
    authenticateAdmin.mockResolvedValue({
      session: { shop: "spark-test.myshopify.com" },
    });
  });

  it("redirects detail=value to the ROI overview", async () => {
    await expectRedirectLocation(
      new Request("https://example.com/app/today/diagnosis?detail=value"),
      "/app/today/roi",
    );
  });

  it("maps valueTab=channels to ROI focus", async () => {
    await expectRedirectLocation(
      new Request(
        "https://example.com/app/today/diagnosis?detail=value&valueTab=channels&returnTo=%2Fapp%2Ftoday",
      ),
      "/app/today/roi?focus=channels&returnTo=%2Fapp%2Ftoday",
    );
  });

  it("maps valueTab=cost to ROI cost settings", async () => {
    await expectRedirectLocation(
      new Request("https://example.com/app/today/diagnosis?detail=value&valueTab=cost"),
      "/app/today/roi?settings=cost",
    );
  });

  it("keeps framework and customers on ROI overview", async () => {
    await expectRedirectLocation(
      new Request("https://example.com/app/today/diagnosis?detail=value&valueTab=framework"),
      "/app/today/roi",
    );
    await expectRedirectLocation(
      new Request("https://example.com/app/today/diagnosis?detail=value&valueTab=customers"),
      "/app/today/roi",
    );
  });
});
