import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import type { AITaskListView, AITaskType } from "../lib/aiTaskTypes";

const VALID_TASK_TYPES: AITaskType[] = [
  "product_improve",
  "image_generation",
  "picture_translate",
];

function parseTaskView(raw: string | null): AITaskListView {
  return raw === "history" ? "history" : "current";
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

function parseTaskTypes(params: URLSearchParams): AITaskType[] {
  return params.getAll("taskType").filter((value): value is AITaskType =>
    VALID_TASK_TYPES.includes(value as AITaskType),
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const view = parseTaskView(url.searchParams.get("view"));
  const page = parsePositiveInt(url.searchParams.get("page"));
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"));
  const taskTypes = parseTaskTypes(url.searchParams);
  const taskPage = await listTasksPageForShop({
    shop: session.shop,
    view,
    page,
    pageSize,
    ...(taskTypes.length === 1
      ? { taskType: taskTypes[0] }
      : taskTypes.length > 1
        ? { taskTypes }
        : {}),
  });

  return Response.json(taskPage);
};
