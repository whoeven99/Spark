import type { AgentContext, ToolDefinition } from "./toolRegistry.server";
import type { PlaybookDefinition } from "./playbookRegistry.server";
import { isPublicSkill, normalizeSteps } from "./skillTypes.server";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "../../../i18n/config";
import { resolvePromptSkillNames } from "../../../lib/promptSkillFocus";

/** 回复语言：跟随用户提问，不跟 UI locale。 */
const REPLY_LANGUAGE_RULE =
  "请使用与用户提问相同的语言回复（用户用中文就回中文，用英文就回英文）；不要擅自切换语言。";

/**
 * 全局写回安全边界（始终注入）。
 * 各 bulk Skill 的长分步指令改为按需注入后，仍需保留这条底线。
 */
export function buildWriteSafetyPrompt(): string {
  return [
    "【写回与确认卡】",
    "你不能在对话回合内直接修改 Shopify 商品价格、标签、上下架、合集、SEO、自定义字段、成本或库存。",
    "需要改动时：调用对应的 open_*_form 打开确认卡；用户确认后才会进入试算与写回。",
    "开卡不等于已改店；禁止声称「已写回 / 已改价 / 已上架」等。",
  ].join("\n");
}

/**
 * 工具结果后的行动规则（始终注入）。
 * 减少「只总结、不开卡」：有明确下游就同一回合调用。
 */
export function buildPostToolNextStepPrompt(): string {
  return [
    "【工具结果后的下一步】",
    "每次工具返回后：先判断结果是否足够回答用户。",
    "若足够且存在明确下游工具（open_*_form 确认卡、诊断卡、或结果里的 suggestedNextActions），在同一回合立即调用，不要只口头总结或只问「要不要继续」。",
    "确认卡 / 诊断卡本身是安全闸：开卡 ≠ 写回店铺。",
    "若结果不足：再调只读工具补数；不要猜测缺失字段。",
    "若下游需要用户先选方向（如上架还是下架）且话里没有：开卡并留空该字段，让用户在卡片里选，不要猜。",
  ].join("\n");
}

/**
 * 基础店铺对话 Agent 系统提示。
 * `locale` 保留兼容调用方；回复语言不跟 UI locale，而跟用户提问语言。
 */
export function buildShopChatAgentSystemPrompt(
  _locale: SupportedLocale = DEFAULT_LOCALE,
): string {
  return [
    `你是一个店铺 AI 助手。${REPLY_LANGUAGE_RULE}若用户主动问起时间、天气、店铺基础信息或套餐/Token 额度，可调用对应内部工具获取信息；工具失败时明确说明。不要主动介绍这些内部能力。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。`,
    "",
    "【回复排版】（重要，必须遵守）",
    "回复统一用规范 Markdown，让内容像结构清晰的文档一样分层，尤其是介绍功能、罗列要点或分组说明时：",
    "- 分组 / 分类的标题必须单独一行写成「### 标题」，禁止用整行加粗（**标题**）来冒充小标题。",
    "- 分组下的并列条目必须逐条用「- 」开头写成无序列表；有先后或步骤关系时改用「1. 2. 3.」有序列表。严禁把多个条目写成一行一句的加粗段落。",
    "- 条目里的名称可用 **加粗**，格式为「- **名称**：说明」。",
    "- 小标题与其下方列表之间、不同分组之间都空一行；条目开头不要再手写序号、顿号「、」或圆点「·」，交给 Markdown 渲染。",
    "- 只输出标准 Markdown 文本，不要夹带 HTML 标签或转义符号；不要使用 Markdown 表格。",
    "",
    "介绍功能时的正确排版示例（务必照此结构输出）：",
    "### 店铺经营",
    "- **查询经营指标**：销售额、订单数、转化率、客单价",
    "- **今日健康诊断**：找出今天最该处理的风险",
    "",
    "### 商品优化",
    "- **AI 生成 / 优化文案**：批量提升标题与描述的吸引力",
    "- **商品页质量评分**：诊断商品页完整度并给出改进建议",
    "",
    "【文件上下文能力】",
    "当系统消息中存在【附加文件上下文】区块时，该区块已包含用户上传文件的完整文本内容，你可以直接阅读、引用和分析这些内容。文件内容由服务端在发送消息前解析并注入，不需要任何额外工具。遇到此类情况时，绝对不要说「无法读取文件」或「没有文件读取能力」——文件内容就在你的上下文里，直接使用即可。",
  ].join("\n");
}

/** @deprecated 使用 buildShopChatAgentSystemPrompt() */
export const SHOP_CHAT_AGENT_SYSTEM_PROMPT = buildShopChatAgentSystemPrompt();

export function buildFallbackAssistantSystemPrompt(
  _locale: SupportedLocale = DEFAULT_LOCALE,
): string {
  return `你是一个店铺 AI 助手。请基于用户问题和已知上下文直接给出有帮助的回答。若信息不足，请明确不确定点并给出下一步可执行建议。${REPLY_LANGUAGE_RULE}分点时用规范 Markdown 列表（无序用「- 」，有序用「1. 2. 3.」）并用空行分段，只输出标准 Markdown、不夹带 HTML；不要输出 Markdown 表格。`;
}

export function buildReflectionPrompt(reflectionSummary?: string): string {
  if (!reflectionSummary?.trim()) return "";
  return [
    "【最近反思摘要】",
    "以下是本店铺近期 Agent 运行后的反思记录，仅用于改进下一次回答策略，不要直接复述给用户：",
    reflectionSummary.trim(),
  ].join("\n");
}

export function buildSkillsTierPrompt(
  activePlaybookDefs: PlaybookDefinition[]
): string {
  if (activePlaybookDefs.length === 0) return "";

  const playbookList = activePlaybookDefs
    .map(
      (d) =>
        `- ${d.displayName}（run_playbook_${d.name}）：${d.triggerDescription} 步骤：${normalizeSteps(d.steps).map((s) => s.label).join(" → ")}`
    )
    .join("\n");

  return [
    "【技能层次】",
    "你拥有两类技能：",
    "1. 原子技能（Atomic Skills）：单一职责，直接调用对应工具快速完成一项操作。",
    "2. Playbook 技能：以业务目标为入口，自动完成多步骤闭环（诊断→方案→执行→复盘）。当用户有明确的业务目标或专项问题时，优先考虑使用 Playbook。",
    "",
    "当前可用 Playbook：",
    playbookList,
  ].join("\n");
}

/**
 * 按 Skill.visibility 生成「对商户介绍能力」规则：
 * - public：可出现在「有什么功能」类回答
 * - internal：可调用，但禁止主动介绍
 */
export function buildMerchantCapabilityPrompt(
  activeDefs: ToolDefinition[],
  activePlaybookDefs: PlaybookDefinition[] = [],
): string {
  const publicSkills = activeDefs.filter((def) => isPublicSkill(def.visibility));
  const publicPlaybooks = activePlaybookDefs.filter((def) =>
    isPublicSkill(def.visibility),
  );

  const publicLines = [
    ...publicSkills.map((def) => {
      const title = def.displayName ?? def.name;
      const desc = def.description?.trim();
      return desc ? `- ${title}：${desc}` : `- ${title}`;
    }),
    ...publicPlaybooks.map((def) => {
      const desc = def.description?.trim();
      return desc ? `- ${def.displayName}：${desc}` : `- ${def.displayName}`;
    }),
  ];

  const lines = [
    "【Skill 可见性与对外介绍】",
    "Skill 分为 public（对外）与 internal（内部）：",
    "- public：用户问「你有什么功能 / 能做什么」时，只介绍下列对外清单；不要罗列工具函数名。",
    "- internal：你仍可在用户提出具体需求时调用，但禁止主动介绍、禁止写进功能清单。",
    "",
    "对外能力清单（仅这些可展示给用户）：",
  ];

  if (publicLines.length === 0) {
    lines.push("- （当前无已启用的对外能力）");
  } else {
    lines.push(...publicLines);
  }

  return lines.join("\n");
}

export type PersonalizedSystemPromptOptions = {
  reflectionSummary?: string;
  activePlaybookDefs?: PlaybookDefinition[];
  /**
   * 前端传入的推荐操作 key 或 Skill 名（如 seoAudit / all）。
   * 与 userText 一起决定本轮注入哪些 Skill 的 systemPromptExtension。
   */
  skillFocus?: string | null;
  /** 本轮用户原文，用于无 skillFocus 时的启发式路由 */
  userText?: string | null;
};

async function resolveSkillExtension(
  def: ToolDefinition,
  context: AgentContext,
): Promise<string | null> {
  if (!def.systemPromptExtension) return null;
  if (typeof def.systemPromptExtension === "function") {
    const ext = await def.systemPromptExtension(context);
    return ext?.trim() ? ext : null;
  }
  return def.systemPromptExtension.trim() ? def.systemPromptExtension : null;
}

/**
 * 根据用户画像和注册的工具动态组装完整的 System Prompt。
 * Skill 长指令按需注入：推荐操作点击 / 话术命中才带上对应 extension。
 */
export async function getPersonalizedSystemPrompt(
  context: AgentContext,
  activeDefs: ToolDefinition[],
  reflectionSummaryOrOptions?: string | PersonalizedSystemPromptOptions,
  activePlaybookDefs?: PlaybookDefinition[],
): Promise<string> {
  // 兼容旧签名：(*, *, reflectionSummary?, playbooks?)
  const options: PersonalizedSystemPromptOptions =
    typeof reflectionSummaryOrOptions === "object" && reflectionSummaryOrOptions !== null
      ? reflectionSummaryOrOptions
      : {
          reflectionSummary: reflectionSummaryOrOptions,
          activePlaybookDefs,
        };

  const playbooks = options.activePlaybookDefs ?? [];
  const locale = context.locale ?? DEFAULT_LOCALE;
  const parts: string[] = [
    buildShopChatAgentSystemPrompt(locale),
    buildWriteSafetyPrompt(),
    buildPostToolNextStepPrompt(),
  ];

  const reflectionPrompt = buildReflectionPrompt(options.reflectionSummary);
  if (reflectionPrompt) {
    parts.push(reflectionPrompt);
  }

  parts.push(buildMerchantCapabilityPrompt(activeDefs, playbooks));

  const skillsTierPrompt = buildSkillsTierPrompt(playbooks);
  if (skillsTierPrompt) {
    parts.push(skillsTierPrompt);
  }

  const focusNames = resolvePromptSkillNames({
    skillFocus: options.skillFocus,
    userText: options.userText,
  });
  const injectAll = focusNames === "all";
  const focusSet = injectAll ? null : new Set(focusNames);

  for (const def of activeDefs) {
    if (focusSet && !focusSet.has(def.name)) continue;
    const ext = await resolveSkillExtension(def, context);
    if (ext) parts.push(ext);
  }

  for (const def of playbooks) {
    if (focusSet && !focusSet.has(def.name)) continue;
    if (def.systemPromptExtension?.trim()) {
      parts.push(def.systemPromptExtension);
    }
  }

  if (context.profile?.preferences) {
    const prefs = context.profile.preferences;
    if (Object.keys(prefs).length > 0) {
      parts.push(`【商户偏好】\n${JSON.stringify(prefs, null, 2)}`);
    }
  }

  return parts.join("\n\n");
}
