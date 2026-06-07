import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { listRecentTasksForShop } from "../../../aiTask/aiTaskStore.server";
import type { AITaskType } from "../../../../lib/aiTaskTypes";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const LIST_MY_TASKS_TOOL_NAME = "list_my_tasks";
const LOG_PREFIX = "[ListMyTasks]";

const TASK_TYPE_VALUES = [
  "image_generation",
  "picture_translate",
  "product_improve",
] as const;

function createListMyTasksTool(context: AgentContext): DynamicStructuredTool {
  const { shop } = context;
  return new DynamicStructuredTool({
    name: LIST_MY_TASKS_TOOL_NAME,
    description:
      "查询该店铺最近的 AI 任务列表（图片生成、图片翻译、商品文案等），了解任务的运行状态、完成情况或错误信息。当用户询问任务进度、历史记录或某任务是否完成时使用。",
    schema: z.object({
      taskType: z
        .enum(TASK_TYPE_VALUES)
        .optional()
        .describe(
          "过滤任务类型：image_generation=图片生成，picture_translate=图片翻译，product_improve=商品文案；不传则返回全部类型",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回条数，默认 10，最大 20"),
    }),
    func: async ({ taskType, limit }) => {
      const requestId = crypto.randomUUID();
      console.info(
        `${LOG_PREFIX} start requestId=${requestId} taskType=${taskType ?? "all"} limit=${limit ?? 10}`,
      );
      if (!shop) {
        return JSON.stringify({ ok: false, errorMsg: "无法识别当前店铺" });
      }
      try {
        const tasks = await listRecentTasksForShop({
          shop,
          taskType: taskType as AITaskType | undefined,
          limit: limit ?? 10,
        });
        console.info(`${LOG_PREFIX} done requestId=${requestId} count=${tasks.length}`);
        return JSON.stringify({
          ok: true,
          count: tasks.length,
          tasks: tasks.map(
            ({
              id,
              taskType: type,
              status,
              estimatedCredits,
              actualCredits,
              startedAt,
              completedAt,
              errorMsg,
            }) => ({
              id,
              taskType: type,
              status,
              estimatedCredits,
              actualCredits,
              startedAt,
              completedAt,
              errorMsg,
            }),
          ),
        });
      } catch (e) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const listMyTasksToolDefinition: ToolDefinition = {
  name: "listMyTasks",
  displayName: "查询任务历史",
  category: "任务管理",
  stage: "monitor",
  description: "查询店铺近期 AI 任务列表（图片生成/翻译/文案），了解任务状态与进度",
  systemPromptExtension:
    "当用户询问任务进度、历史任务、某任务是否完成时，调用工具 list_my_tasks 获取近期任务列表，可用 taskType 过滤类型。任务状态说明：running=进行中，succeeded=成功，failed=失败，pending_review=待审核，applied=已应用，cancelled=已取消。",
  createTool: (context) => createListMyTasksTool(context),
};
