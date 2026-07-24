import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "../ai/core/toolRegistry.server";
import { parseUsageMetadata } from "./parseUsageMetadata.server";
import { recordTokenUsage } from "./recordTokenUsage.server";

/**
 * 包装 LangChain Tool：在每次调用后尝试记录 token（工具内 LLM 可通过返回值附带 usage）。
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

      let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      if (result && typeof result === "object" && "tokenUsage" in result) {
        usage = parseUsageMetadata(
          (result as { tokenUsage?: unknown }).tokenUsage,
        );
      }

      if (usage.totalTokens > 0) {
        await recordTokenUsage({ shop, usage });
      }

      return result;
    },
  }) as DynamicStructuredTool;
}
