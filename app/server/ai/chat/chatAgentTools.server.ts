import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createShopifyShopInfoTools } from "../tools/baseAgentTools.server";
import { createGenerateProductDescriptionTool } from "../tools/implementations/generateDescriptionTool";
import { translationTaskFormTool } from "../tools/implementations/translationTaskFormTool";
import type { ShopifyAdminGraphqlClient } from "../tools/implementations/shopifyShopInfoTool";

/**
 * 嵌入式聊天 Agent 的店铺相关工具集合（统一注册入口）。
 */
export function buildChatAgentExtraTools(
  admin: ShopifyAdminGraphqlClient,
): DynamicStructuredTool[] {
  const shopifyTools = createShopifyShopInfoTools(admin);
  return [
    ...shopifyTools,
    translationTaskFormTool,
    createGenerateProductDescriptionTool(admin),
  ];
}
