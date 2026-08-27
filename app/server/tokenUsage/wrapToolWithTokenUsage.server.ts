import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "../ai/core/toolRegistry.server";
import { recordChatTokenUsage } from "./chatTokenUsage.server";

/**
 * 包装 LangChain Tool：若工具返回值显式带 tokenUsage，则按 feature=chat 记入统一明细。
 * 多数业务工具已在内部走 recordBilled*；此包装仅兜底旧返回值形态。
 */
export function wrapToolWithTokenUsage(
  tool: DynamicStructuredTool,
  context: AgentContext,
): DynamicStructuredTool {
  const shop = context.shop?.trim();
  if (!shop) return tool;

  const originalFunc = tool.func.bind(tool);

  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (input, runManager, config) => {
      const result = await originalFunc(input, runManager, config);

      if (result && typeof result === "object" && "tokenUsage" in result) {
        await recordChatTokenUsage({
          shop,
          usage: (result as { tokenUsage?: unknown }).tokenUsage,
        });
      }

      return result;
    },
  }) as DynamicStructuredTool;
}
