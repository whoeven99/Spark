import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { ShopifyAdminGraphqlClient } from "./implementations/shopifyShopInfoTool";

export interface UserProfile {
  // 可根据需要扩展，例如订阅套餐、行业、商户偏好等
  plan?: "free" | "pro" | "enterprise";
  industry?: string;
  preferences?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentContext {
  admin: ShopifyAdminGraphqlClient;
  profile?: UserProfile;
}

export interface ToolDefinition {
  name: string;
  /**
   * 描述该工具的适用场景，用于注释和管理
   */
  description?: string;
  /**
   * 判断该工具是否应对当前用户/店铺开放
   */
  condition?: (context: AgentContext) => boolean | Promise<boolean>;
  /**
   * 工厂方法，用于实例化 LangChain Tool
   */
  createTool: (
    context: AgentContext
  ) =>
    | DynamicStructuredTool
    | DynamicStructuredTool[]
    | Promise<DynamicStructuredTool | DynamicStructuredTool[]>;
}

class ToolRegistry {
  private tools: ToolDefinition[] = [];

  register(definition: ToolDefinition) {
    this.tools.push(definition);
  }

  async getToolsForContext(
    context: AgentContext
  ): Promise<DynamicStructuredTool[]> {
    const activeTools: DynamicStructuredTool[] = [];

    for (const def of this.tools) {
      try {
        if (def.condition) {
          const isEnabled = await def.condition(context);
          if (!isEnabled) continue;
        }

        const created = await def.createTool(context);
        if (Array.isArray(created)) {
          activeTools.push(...created);
        } else {
          activeTools.push(created);
        }
      } catch (err) {
        console.error(`[ToolRegistry] Failed to create tool ${def.name}:`, err);
      }
    }

    return activeTools;
  }
}

export const globalToolRegistry = new ToolRegistry();
