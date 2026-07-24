import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentContext, ToolDefinition } from "./toolRegistry.server";
import { normalizeSteps, type StepInput } from "./skillTypes.server";
import type {
  PlaybookCaseDraft,
  PlaybookStructuredResult,
} from "../../playbookCase/types.server";

// ──────────────────────────────────────────────
// Playbook 执行结果
// ──────────────────────────────────────────────

export interface PlaybookStepResult {
  step: string;
  status: "completed" | "skipped" | "error";
  output: string;
}

export interface PlaybookRunResult {
  ok: boolean;
  /** 给主 agent LLM 用的人类可读摘要 */
  summary: string;
  steps: PlaybookStepResult[];
  data?: Record<string, unknown>;
  structuredResult?: PlaybookStructuredResult;
  caseDraft?: PlaybookCaseDraft;
}

export interface PlaybookRunParams {
  goal: string;
  constraints?: string;
  context: AgentContext;
  onStep?: (step: string, status: "running" | "completed" | "error") => void;
}

export interface PlaybookPresentation {
  icon?: string;
  entryTitle?: string;
  entrySubtitle?: string;
  evidenceKeys?: string[];
  defaultPrompt?: string;
  ctaLabel?: string;
  runTitle?: string;
  reviewMetrics?: string[];
}

// ──────────────────────────────────────────────
// PlaybookDefinition
// ──────────────────────────────────────────────

export interface PlaybookDefinition {
  /** 唯一标识，工具名将为 run_playbook_{name} */
  name: string;
  /** 展示名（中文）*/
  displayName: string;
  /** 一句话价值描述 */
  description: string;
  /** 业务分类 */
  category:
    | "acquisition"
    | "conversion"
    | "retention"
    | "merchandising"
    | "operations"
    | "inventory"
    | "afterSales"
    | "international"
    | "competitive";
  /** 告诉 LLM 何时应选择此 Playbook */
  triggerDescription: string;
  /**
   * 步骤声明，用于 system prompt / admin 流程图展示。
   * 可写字符串（label 即 id），也可写完整 StepSpec 以携带 kind/stage/runningLabel。
   */
  steps: readonly StepInput[];
  /** 是否对当前上下文开放（未提供则默认开放）*/
  condition?: (ctx: AgentContext) => boolean | Promise<boolean>;
  /** 额外注入 system prompt 的专属指令（可选）*/
  systemPromptExtension?: string;
  /** 工作台/对话入口展示协议。 */
  presentation?: PlaybookPresentation;
  /** 多步骤执行函数 */
  run: (params: PlaybookRunParams) => Promise<PlaybookRunResult>;
  /** 拦截流式事件（与 ToolDefinition.onStreamEvent 接口相同）*/
  onStreamEvent?: ToolDefinition["onStreamEvent"];
  /** 从最终消息中提取 UI 载荷 */
  extractUIPayload?: (
    messages: BaseMessage[],
    lastUserText: string,
    assistantReplyRaw: string
  ) => unknown;
  uiPayloadKey?: string;
}

// ──────────────────────────────────────────────
// PlaybookRegistry
// ──────────────────────────────────────────────

export class PlaybookRegistry {
  private definitions: Map<string, PlaybookDefinition> = new Map();

  register(def: PlaybookDefinition): void {
    this.definitions.set(def.name, def);
  }

  getRegistered(): PlaybookDefinition[] {
    return Array.from(this.definitions.values());
  }

  async getActiveDefinitions(ctx: AgentContext): Promise<PlaybookDefinition[]> {
    const result: PlaybookDefinition[] = [];
    for (const def of this.definitions.values()) {
      if (def.condition) {
        try {
          if (!(await def.condition(ctx))) continue;
        } catch (e) {
          console.error(`[PlaybookRegistry] condition error for ${def.name}:`, e);
          continue;
        }
      }
      result.push(def);
    }
    return result;
  }

  /** 为每个活跃 Playbook 生成一个 run_playbook_{name} 工具 */
  async getPlaybookTools(ctx: AgentContext): Promise<DynamicStructuredTool[]> {
    const active = await this.getActiveDefinitions(ctx);
    return active.map(
      (def) =>
        new DynamicStructuredTool({
          name: `run_playbook_${def.name}`,
          description: [
            `[Playbook: ${def.displayName}]`,
            def.description,
            `触发条件：${def.triggerDescription}`,
            `步骤：${normalizeSteps(def.steps).map((s) => s.label).join(" → ")}`,
          ].join(" "),
          schema: z.object({
            goal: z.string().describe("用户的具体业务目标或问题描述"),
            constraints: z
              .string()
              .optional()
              .describe("限制条件，如不能改价、只看某类目等（可选）"),
          }),
          func: async ({ goal, constraints }) => {
            try {
              const result = await def.run({
                goal,
                constraints,
                context: ctx,
                onStep: (step, status) =>
                  ctx.emitProgress?.({
                    skill: def.name,
                    stepId: step,
                    label: step,
                    status,
                  }),
              });
              return JSON.stringify(result);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`[Playbook:${def.name}] run error:`, e);
              const errorResult: PlaybookRunResult = {
                ok: false,
                summary: `Playbook "${def.displayName}" 执行失败：${msg}`,
                steps: [],
              };
              return JSON.stringify(errorResult);
            }
          },
        })
    );
  }
}

export const globalPlaybookRegistry = new PlaybookRegistry();
