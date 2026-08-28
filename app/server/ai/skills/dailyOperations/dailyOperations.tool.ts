import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { ensureDailySnapshotOverview } from "../../../operations/dailyInspection.server";

export const GET_DAILY_OPERATIONS_TOOL_NAME = "get_daily_operations";
const LOG_PREFIX = "[DailyOperations]";

const QUADRANT_LABELS: Record<string, string> = {
  q1: "紧急重要",
  q2: "紧急不重要",
  q3: "不紧急重要",
  q4: "不紧急不重要",
};

export function createGetDailyOperationsTool(context: AgentContext): DynamicStructuredTool {
  const { shop } = context;
  return new DynamicStructuredTool({
    name: GET_DAILY_OPERATIONS_TOOL_NAME,
    description:
      "获取店铺当日经营诊断快照与四象限待办任务的原始数据，供文字解读使用。当用户明确要求用文字总结/解读诊断并引用数字时使用。若用户只是想查看今日健康诊断与待办，应优先改用 open_health_diagnosis_form。",
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
        const result = await ensureDailySnapshotOverview(shop, {
          shopifyAdmin: context.admin,
        });
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

/**
 * @deprecated 已并入 skills/index 的 shopOperations（店铺经营）。
 * 保留定义供参考；勿再单独 register。
 */
export const dailyOperationsToolDefinition: ToolDefinition = {
  name: "dailyOperations",
  displayName: "健康度与待办",
  category: "店铺运营",
  stage: "monitor",
  description:
    "读取当日健康诊断快照与任务中心待办，回答今天有哪些风险、异常和待处理事项",
  systemPromptExtension:
    "当用户询问「今天店铺有什么要处理的」「有哪些经营风险 / 待办任务」「昨天的问题处理得怎么样」时，调用工具 get_daily_operations 获取当日健康诊断与待办任务。回复时先讲紧急重要（q1/P0）任务，再概述其他象限；诊断结论需引用 evidence 中的具体数字。任务状态：open=待处理，in_progress=处理中，done=已完成，ignored=已忽略，auto_closed=问题已自动消除。",
  createTool: (context) => createGetDailyOperationsTool(context),
};
