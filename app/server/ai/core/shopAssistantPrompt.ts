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

  if (context.profile) {
    const profileParts: string[] = [
      "【商店画像】",
      "以下为安装/刷新时从 Shopify 写入的店铺基础信息；勿编造未列出的事实。",
    ];
    if (context.profile.promptSnippet) {
      profileParts.push(context.profile.promptSnippet);
    }
    if (context.profile.shopProfileMarkdown) {
      profileParts.push("", context.profile.shopProfileMarkdown);
    }
    if (profileParts.length > 2) {
      parts.push(profileParts.join("\n"));
    }
    const prefs = context.profile.preferences;
    if (prefs && Object.keys(prefs).length > 0) {
      parts.push(
        `【商户偏好】\n${JSON.stringify(prefs, null, 2)}`,
      );
    }
  }

  return parts.join("\n\n");
}
