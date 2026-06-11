import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { ensureDailySnapshot } from "../../../operations/dailyInspection.server";

export const GET_DAILY_OPERATIONS_TOOL_NAME = "get_daily_operations";
const LOG_PREFIX = "[DailyOperations]";

const QUADRANT_LABELS: Record<string, string> = {
  q1: "紧急重要",
  q2: "紧急不重要",
  q3: "不紧急重要",
  q4: "不紧急不重要",
};

function createGetDailyOperationsTool(context: AgentContext): DynamicStructuredTool {
  const { shop } = context;
  return new DynamicStructuredTool({
    name: GET_DAILY_OPERATIONS_TOOL_NAME,
    description:
      "获取店铺当日经营诊断快照与四象限待办任务：销售趋势、履约健康、物流异常、退款售后、库存健康五项诊断，以及由诊断规则生成的待办任务（含优先级、触发原因、建议动作）。当用户询问「今天有什么要处理的」「店铺今天情况如何」「有哪些待办/风险」时使用。",
    schema: z.object({
      includeClosedTasks: z
        .boolean()
        .optional()
        .describe("是否包含近 3 天已关闭（完成/忽略/自动消除）的任务，默认 false"),
    }),
    func: async ({ includeClosedTasks }) => {
      const requestId = crypto.randomUUID();
      console.info(`${LOG_PREFIX} start requestId=${requestId} shop=${shop}`);
      if (!shop) {
        return JSON.stringify({ ok: false, errorMsg: "无法识别当前店铺" });
      }
      try {
        const result = await ensureDailySnapshot(shop);
        if (!result.hasData) {
          return JSON.stringify({
            ok: true,
            hasData: false,
            message:
              "店铺暂无已同步的订单数据，无法生成诊断。可提示用户先在补录页回填历史订单。",
          });
        }
        const tasks = result.tasks
          .filter(
            (task) =>
              includeClosedTasks ||
              ["open", "in_progress"].includes(task.status),
          )
          .map((task) => ({
            id: task.id,
            title: task.title,
            quadrant: QUADRANT_LABELS[task.quadrant] ?? task.quadrant,
            priority: task.priority,
            status: task.status,
            triggerReason: task.triggerReason,
            suggestedActions: task.suggestedActions,
            ownerRole: task.ownerRole,
            dueWindow: task.dueWindow,
          }));
        console.info(
          `${LOG_PREFIX} done requestId=${requestId} tasks=${tasks.length}`,
        );
        return JSON.stringify({
          ok: true,
          hasData: true,
          snapshotDate: result.snapshotDate,
          metrics: result.metrics,
          diagnosis: result.items.map((item) => ({
            name: item.name,
            status: item.status,
            evidence: item.evidence,
            reasoning: item.reasoning,
          })),
          tasks,
          review: result.review,
        });
      } catch (e) {
        console.error(`${LOG_PREFIX} requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const dailyOperationsToolDefinition: ToolDefinition = {
  name: "dailyOperations",
  displayName: "每日经营待办",
  category: "店铺运营",
  stage: "monitor",
  description:
    "读取当日经营诊断快照（销售/履约/物流/退款/库存）与四象限待办任务，回答今天需要处理什么",
  systemPromptExtension:
    "当用户询问「今天店铺有什么要处理的」「有哪些经营风险 / 待办任务」「昨天的问题处理得怎么样」时，调用工具 get_daily_operations 获取当日诊断与四象限待办。回复时先讲紧急重要（q1/P0）任务，再概述其他象限；诊断结论需引用 evidence 中的具体数字。任务状态：open=待处理，in_progress=处理中，done=已完成，ignored=已忽略，auto_closed=问题已自动消除。",
  createTool: (context) => createGetDailyOperationsTool(context),
};
