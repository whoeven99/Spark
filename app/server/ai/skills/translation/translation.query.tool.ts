import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import {
  getV4JobProgressSummary,
  listV4JobProgressSummaries,
} from "../../../translation/v4/v4JobProgress.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const QUERY_TRANSLATION_TASKS_TOOL_NAME = "query_translation_tasks";
const LOG_PREFIX = "[QueryTranslationTasks]";

export function createTranslationQueryTool(context: AgentContext): DynamicStructuredTool {
  const { shop } = context;

  return new DynamicStructuredTool({
    name: QUERY_TRANSLATION_TASKS_TOOL_NAME,
    description:
      "查询店铺批量翻译任务（V4 翻译流水线）的列表或单个任务进度。当用户询问翻译任务进度、某次翻译是否完成、法语/日语翻译跑到哪一步、最近创建了哪些翻译任务时使用。传入 taskId 返回该任务详细进度；不传则返回近期任务列表摘要。",
    schema: z.object({
      taskId: z
        .string()
        .optional()
        .describe("翻译任务 ID（UUID）；用户提到具体任务号或 jobId 时传入"),
      targetLocale: z
        .string()
        .optional()
        .describe("按目标语言筛选列表，如 ja、fr、en"),
      activeOnly: z
        .boolean()
        .optional()
        .describe("为 true 时仅返回进行中的翻译任务"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("列表最多返回条数，默认 10，最大 20"),
    }),
    func: async ({ taskId, targetLocale, activeOnly, limit }) => {
      const requestId = crypto.randomUUID();
      console.info(
        `${LOG_PREFIX} start requestId=${requestId} taskId=${taskId ?? "-"} target=${targetLocale ?? "-"} activeOnly=${Boolean(activeOnly)}`,
      );

      if (!shop) {
        return JSON.stringify({ ok: false, errorMsg: "无法识别当前店铺" });
      }

      try {
        if (taskId?.trim()) {
          const task = await getV4JobProgressSummary(shop, taskId.trim());
          if (!task) {
            return JSON.stringify({
              ok: false,
              errorMsg: `未找到翻译任务 ${taskId.trim()}，请确认任务 ID 或改查近期任务列表`,
            });
          }
          console.info(`${LOG_PREFIX} detail requestId=${requestId} taskId=${task.taskId} status=${task.status}`);
          return JSON.stringify({ ok: true, mode: "detail", task });
        }

        const tasks = await listV4JobProgressSummaries(shop, {
          limit: limit ?? 10,
          targetLocale,
          activeOnly,
        });
        console.info(`${LOG_PREFIX} list requestId=${requestId} count=${tasks.length}`);
        return JSON.stringify({
          ok: true,
          mode: "list",
          count: tasks.length,
          tasks,
        });
      } catch (error) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, error);
        return JSON.stringify({
          ok: false,
          errorMsg: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
