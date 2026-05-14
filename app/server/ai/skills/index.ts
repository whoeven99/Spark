import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createShopifyShopInfoTools } from "./shopifyInfo/tool";
import { createGenerateProductDescriptionTool } from "./marketing/tool";
import { translationTaskFormTool } from "./translation/tool";
import { globalToolRegistry, type AgentContext } from "../core/toolRegistry.server";

// ==========================================
// 注册各类核心与扩展 Tools 到全局注册表
// ==========================================

globalToolRegistry.register({
  name: "shopifyShopInfo",
  description: "获取 Shopify 商店的基础信息",
  createTool: ({ admin }) => createShopifyShopInfoTools(admin),
});

globalToolRegistry.register({
  name: "translationTaskForm",
  description: "打开翻译任务表单卡片",
  createTool: () => translationTaskFormTool,
});

globalToolRegistry.register({
  name: "generateProductDescription",
  description: "生成商品描述（可结合用户画像进行个性化建议）",
  // 示例：可以根据 profile 决定是否提供特定功能
  // condition: ({ profile }) => profile?.plan !== 'free',
  createTool: ({ admin }) => createGenerateProductDescriptionTool(admin),
});

/**
 * 嵌入式聊天 Agent 的店铺相关工具集合（基于注册表动态组装）。
 * 后续可传入用户信息/画像（Profile）以便个性化返回 tools。
 */
export async function buildChatAgentExtraTools(
  context: AgentContext
): Promise<DynamicStructuredTool[]> {
  // 根据 AgentContext（如 admin，profile）从注册表获取所有可用的工具
  const tools = await globalToolRegistry.getToolsForContext(context);
  return tools;
}
