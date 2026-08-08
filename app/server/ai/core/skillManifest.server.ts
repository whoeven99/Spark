import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { globalToolRegistry, type AgentContext } from "./toolRegistry.server";
import { globalPlaybookRegistry, type PlaybookPresentation } from "./playbookRegistry.server";
import { normalizeSteps, type SkillStage, type StepSpec } from "./skillTypes.server";
// 触发注册副作用，保证独立调用本模块时注册表已填充
import "../skills/index";
import "../playbooks/index";

// ──────────────────────────────────────────────
// 能力清单（admin 可视化的单一事实源，从注册表自动派生）
// ──────────────────────────────────────────────

export interface SkillParamManifest {
  name: string;
  type: string;
  desc: string;
  required: boolean;
}

export interface ToolManifest {
  name: string;
  description: string;
  params: SkillParamManifest[];
}

export interface AtomicSkillManifest {
  name: string;
  displayName: string;
  description: string;
  category: string;
  stage?: SkillStage;
  conditional: boolean;
  steps: StepSpec[];
  tools: ToolManifest[];
}

export interface PlaybookManifest {
  name: string;
  displayName: string;
  description: string;
  category: string;
  triggerDescription: string;
  conditional: boolean;
  steps: StepSpec[];
  presentation?: PlaybookPresentation;
}

export interface CapabilitiesManifest {
  stats: { skillCount: number; toolCount: number; playbookCount: number };
  skills: AtomicSkillManifest[];
  playbooks: PlaybookManifest[];
}

// ──────────────────────────────────────────────
// zod schema → 参数表（自动派生，无需手抄）
// ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonSchemaType(def: any): string {
  if (!def || typeof def !== "object") return "any";
  if (Array.isArray(def.type)) return def.type.join(" | ");
  if (def.type === "array") return `${jsonSchemaType(def.items)}[]`;
  if (Array.isArray(def.enum)) return def.enum.map(String).join(" | ");
  if (Array.isArray(def.anyOf)) return def.anyOf.map(jsonSchemaType).join(" | ");
  return typeof def.type === "string" ? def.type : "any";
}

function extractParams(schema: unknown): SkillParamManifest[] {
  if (!schema) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = schema;
  // 若是 zod schema，转为 JSON schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (schema as any).safeParse === "function") {
    try {
      json = z.toJSONSchema(schema as z.ZodType);
    } catch {
      return [];
    }
  }
  const props = json?.properties;
  if (!props || typeof props !== "object") return [];
  const required: string[] = Array.isArray(json.required) ? json.required : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.entries(props).map(([name, def]: [string, any]) => ({
    name,
    type: jsonSchemaType(def),
    desc: typeof def?.description === "string" ? def.description : "",
    required: required.includes(name),
  }));
}

function toToolManifest(tool: DynamicStructuredTool): ToolManifest {
  return {
    name: tool.name,
    description: tool.description ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: extractParams((tool as any).schema),
  };
}

/** 用于 describe 阶段实例化工具的最小 stub context（不会真正发起请求）。 */
function createStubContext(): AgentContext {
  return {
    admin: {
      graphql: async () =>
        new Response(JSON.stringify({ data: {} }), {
          headers: { "content-type": "application/json" },
        }),
    },
    shop: "__manifest__",
  };
}

/**
 * 从注册表构建完整能力清单。admin 端通过 /api/ai-capabilities 获取。
 * 列出**全部已注册**能力（含条件启用），conditional 标记是否带 condition 门控。
 */
export async function buildCapabilitiesManifest(): Promise<CapabilitiesManifest> {
  const stub = createStubContext();

  const skillDefs = globalToolRegistry.getRegisteredTools();
  const skills: AtomicSkillManifest[] = [];
  for (const def of skillDefs) {
    let tools: ToolManifest[] = [];
    try {
      const created = await def.createTool(stub);
      const arr = Array.isArray(created) ? created : [created];
      tools = arr.map(toToolManifest);
    } catch (e) {
      console.warn(`[skillManifest] describe failed for ${def.name}:`, e);
    }
    skills.push({
      name: def.name,
      displayName: def.displayName ?? def.name,
      description: def.description ?? "",
      category: def.category ?? "未分类",
      stage: def.stage,
      conditional: typeof def.condition === "function",
      steps: normalizeSteps(def.steps),
      tools,
    });
  }

  const playbooks: PlaybookManifest[] = globalPlaybookRegistry
    .getRegistered()
    .map((def) => ({
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      category: def.category,
      triggerDescription: def.triggerDescription,
      conditional: typeof def.condition === "function",
      steps: normalizeSteps(def.steps),
      presentation: def.presentation,
    }));

  const toolCount = skills.reduce((sum, s) => sum + s.tools.length, 0);

  return {
    stats: {
      skillCount: skills.length,
      toolCount,
      playbookCount: playbooks.length,
    },
    skills,
    playbooks,
  };
}
