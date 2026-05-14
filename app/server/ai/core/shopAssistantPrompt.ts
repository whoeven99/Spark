import type { AgentContext, ToolDefinition } from "./toolRegistry.server";

/**
 * 基础店铺对话 Agent 系统提示
 */
export const SHOP_CHAT_AGENT_SYSTEM_PROMPT =
  "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。回复尽量结构清晰，优先使用短段落和列表，不要使用 Markdown 表格。";

/**
 * 根据用户画像和注册的工具动态组装完整的 System Prompt。
 */
export async function getPersonalizedSystemPrompt(
  context: AgentContext,
  activeDefs: ToolDefinition[]
): Promise<string> {
  const parts: string[] = [SHOP_CHAT_AGENT_SYSTEM_PROMPT];

  // 拼接每个工具的特定 Prompt 指令
  for (const def of activeDefs) {
    if (def.systemPromptExtension) {
      if (typeof def.systemPromptExtension === "function") {
        const ext = await def.systemPromptExtension(context);
        if (ext) parts.push(ext);
      } else {
        parts.push(def.systemPromptExtension);
      }
    }
  }

  // 如果有用户画像，拼接个性化提示
  if (context.profile) {
    parts.push(
      `【用户画像与偏好】：\n请根据以下用户信息提供更贴近其业务场景和习惯的个性化建议：\n${JSON.stringify(
        context.profile,
        null,
        2
      )}`
    );
  }

  return parts.join("\n\n");
}
