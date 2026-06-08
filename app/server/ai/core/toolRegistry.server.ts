import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { BaseMessage } from "@langchain/core/messages";
import type { ShopifyAdminGraphqlClient } from "../skills/shopifyInfo/shopifyInfo.tool";
import { wrapToolWithTokenUsage } from "../../tokenUsage/wrapToolWithTokenUsage.server";
import type {
  EmitSkillProgress,
  SkillStage,
  StepInput,
} from "./skillTypes.server";

export interface UserProfile {
  preferences?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentContext {
  admin: ShopifyAdminGraphqlClient;
  profile?: UserProfile;
  shop?: string;
  /**
   * 统一进度发射器（原子 Skill 与 Playbook 共用）。
   * 由 agentStream 在 graph.stream() 前注入，映射为 SSE `skill_progress`。
   */
  emitProgress?: EmitSkillProgress;
  /**
   * @deprecated 旧的 Playbook 进度回调，保留兼容；内部转发到 emitProgress。
   */
  emitPlaybookStep?: (playbookName: string, step: string, status: "running" | "completed" | "error") => void;
}

export interface ToolDefinition {
  name: string;
  /**
   * 展示名（中文），用于 admin 能力概览；缺省时回退到 name
   */
  displayName?: string;
  /**
   * 业务分类，用于 admin 分组
   */
  category?: string;
  /**
   * 运营闭环环节，用于 admin 配色与定位
   */
  stage?: SkillStage;
  /**
   * 该原子 Skill 的内部流程步骤声明（可选）。
   * 单步工具可不填；多阶段工具（如文生图）填写后即可在聊天/Admin 展示流程。
   */
  steps?: readonly StepInput[];
  /**
   * 描述该工具的适用场景，用于注释和管理
   */
  description?: string;
  /**
   * 判断该工具是否应对当前用户/店铺开放
   */
  condition?: (context: AgentContext) => boolean | Promise<boolean>;
  /**
   * 该工具专属的 System Prompt 扩展，加载时拼接到主 Prompt 中
   */
  systemPromptExtension?: string | ((context: AgentContext) => string | Promise<string>);
  /**
   * 工厂方法，用于实例化 LangChain Tool
   */
  createTool: (
    context: AgentContext
  ) =>
    | DynamicStructuredTool
    | DynamicStructuredTool[]
    | Promise<DynamicStructuredTool | DynamicStructuredTool[]>;

  /**
   * 拦截流式事件（如 tool_start, tool_end），用于自定义下发给前端的 SSE Chunk
   */
  onStreamEvent?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enqueue: (chunk: any) => void,
    context: { emittedFlags: Set<string> }
  ) => void;

  /**
   * 最终在对话结束时，从整个消息序列和回复中提取特定的 UI Payload（例如卡片数据）
   * 如果提供了 uiPayloadKey，提取出的结果会被注入到最终 Response 或 Stream 的 done 元数据中
   */
  extractUIPayload?: (
    messages: BaseMessage[],
    lastUserText: string,
    assistantReplyRaw: string
  ) => unknown;

  /**
   * 对应 extractUIPayload 的字段名称，例如 "translationTaskForm" 或 "generateDescriptionCard"
   */
  uiPayloadKey?: string;
}

class ToolRegistry {
  private tools: ToolDefinition[] = [];

  register(definition: ToolDefinition) {
    this.tools.push(definition);
  }

  getRegisteredTools(): ToolDefinition[] {
    return this.tools;
  }

  async getActiveToolDefinitions(context: AgentContext): Promise<ToolDefinition[]> {
    const activeDefs: ToolDefinition[] = [];
    for (const def of this.tools) {
      if (def.condition) {
        try {
          const isEnabled = await def.condition(context);
          if (!isEnabled) continue;
        } catch (err) {
          console.error(`[ToolRegistry] condition check failed for ${def.name}:`, err);
          continue;
        }
      }
      activeDefs.push(def);
    }
    return activeDefs;
  }

  async getToolsForContext(
    context: AgentContext
  ): Promise<DynamicStructuredTool[]> {
    const activeTools: DynamicStructuredTool[] = [];
    const activeDefs = await this.getActiveToolDefinitions(context);

    for (const def of activeDefs) {
      try {
        const created = await def.createTool(context);
        const wrap = (tool: DynamicStructuredTool) =>
          wrapToolWithTokenUsage(tool, context);

        if (Array.isArray(created)) {
          activeTools.push(...created.map(wrap));
        } else {
          activeTools.push(wrap(created));
        }
      } catch (err) {
        console.error(`[ToolRegistry] Failed to create tool ${def.name}:`, err);
      }
    }

    return activeTools;
  }
}

export const globalToolRegistry = new ToolRegistry();

/** Atomic Skill 的语义别名，与 ToolDefinition 完全等价 */
export type AtomicSkillDefinition = ToolDefinition;
