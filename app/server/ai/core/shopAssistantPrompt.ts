import type { AgentContext, ToolDefinition } from "./toolRegistry.server";
import type { PlaybookDefinition } from "./playbookRegistry.server";
import { isPublicSkill, normalizeSteps } from "./skillTypes.server";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "../../../i18n/config";
import { isCapabilityOverviewUserIntent } from "../../../lib/capabilityActionsIntent";
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
    "对话内不能直接改 Shopify 价格、标签或上下架；要改就调用对应 open_*_form。",
    "开卡 ≠ 已写回；禁止声称「已写回 / 已改价 / 已上架」。",
  ].join("\n");
}

/**
 * 工具结果后的行动规则（始终注入）。
 * 减少「只总结、不开卡」：有明确下游就同一回合调用。
 */
export function buildPostToolNextStepPrompt(): string {
  return [
    "【工具结果后的下一步】",
    "工具返回后：够答就答；仅当用户本轮意图明确需要下游（对应 open_*_form / 诊断卡 / suggestedNextActions）时同一回合立刻调用，不要只总结或只问「要不要继续」。",
    "开卡 ≠ 写回。缺数就再调只读工具，勿猜。缺方向（如上架还是下架）就开卡留空该字段，让用户在卡里选。",
  ].join("\n");
}

/**
 * 回复形态（始终注入）：先判目的再作答，卡片按需。
 * 动作唯一才开卡；笼统与多意图先给判断，可点操作由服务端挂在回复下方。
 */
export function buildAnswerShapePrompt(): string {
  return [
    "【先判目的再作答】",
    "每轮先判断用户真正想要什么，再结合已知店铺情况给出你的判断和建议；不要泛泛罗列通用做法，也不要为了用工具而用工具。",
    "动作唯一且明确（如「降价 10%」「导出商品」）：直接调用对应 open_*_form，不要反问。",
    "方向明确但有多条路径（如「让商品页更好」可走质量评分 / 文案 / 图片翻译）：先用一两句讲清各条路的差别与建议顺序，让用户选；不要替用户挑一张卡开。",
    "笼统问店况（「店铺怎么样 / 近况 / 怎么多卖点」且没点名诊断、待办、风险清单或某项指标）：用简短文字给结论，最多一次 get_shopify_shop_metrics（metrics=summary），不要开 open_health_diagnosis_form，也不要连调多个工具写长报告。",
    "以上两类不开卡的情况：把话说清楚后，调用 suggest_next_actions 传你刚推荐的那 1–4 个方向，系统会渲染成回复下方的可点按钮；末尾自然邀请用户选一个即可，不要自己罗列按钮，也不要让用户去别处找入口。",
  ].join("\n");
}

/**
 * 相近能力互斥（始终注入，短规则）。
 * 配合各工具 schema description，降低自由输入选错工具的概率。
 */
export function buildToolMutexPrompt(): string {
  return [
    "【工具互斥】按意图选入口，不要串门：",
    "- 改价/涨价/降价/划线价 → open_bulk_price_edit_form（不要用导入商品）",
    "- 改标签 → open_bulk_tag_edit_form；上下架 → open_bulk_status_edit_form",
    "- 改 vendor/类型/SEO/合集/成本/Handle/Metafield、批量改标题正文、归档删除 → open_product_import_form",
    "- 导出 CSV/Feed → open_product_export_form",
    "- 商品营销文案（标题/描述）→ open_product_improve_form；翻译图片上的文字 → open_picture_translate_form；文生图 → open_image_generation_form",
    "- 「翻译图片」≠ 文案优化；「改价」≠ 导入表格。",
  ].join("\n");
}

/** 常驻短排版约束。 */
export function buildReplyFormattingPrompt(): string {
  return [
    "【回复排版】",
    "用标准 Markdown：分组标题单独一行「### 标题」（勿用整行 **加粗** 冒充标题）；并列用「- 」列表，步骤用「1. 2. 3.»；条目名称可「- **名称**：说明」。",
    "小标题与列表、分组之间空一行；勿手写顿号/圆点序号；勿输出 HTML 或 Markdown 表格。",
  ].join("\n");
}

/** discovery 回合才附带的排版示例。 */
export function buildCapabilityFormattingExamplePrompt(): string {
  return [
    "介绍功能时按此结构输出：",
    "### 店铺经营",
    "- **查询经营指标**：销售额、订单数、转化率、客单价",
    "- **今日健康诊断**：找出今天最该处理的风险",
    "",
    "### 商品优化",
    "- **AI 生成 / 优化文案**：批量提升标题与描述的吸引力",
    "- **商品页质量评分**：诊断商品页完整度并给出改进建议",
  ].join("\n");
}

/** 本轮带上传文件时才注入。 */
export function buildFileContextCapabilityPrompt(): string {
  return [
    "【文件上下文】",
    "消息中若有【附加文件上下文】，内容已由服务端解析注入，直接阅读引用即可，不要说无法读取文件，也不要为读文件再调工具。",
  ].join("\n");
}

/**
 * 基础店铺对话 Agent 系统提示（角色 + 语言；排版/文件另段按需拼）。
 * `locale` 保留兼容调用方；回复语言不跟 UI locale，而跟用户提问语言。
 */
export function buildShopChatAgentSystemPrompt(
  _locale: SupportedLocale = DEFAULT_LOCALE,
): string {
  return `你是一个店铺 AI 助手。${REPLY_LANGUAGE_RULE}若用户主动问起时间、天气、店铺基础信息或套餐/Token 额度，可调用对应内部工具获取信息；工具失败时明确说明。不要主动介绍这些内部能力。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。`;
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
 * 按 Skill.visibility 生成「对商户介绍能力」规则。
 * - 默认（闲聊/办事）：只注入短规则，不付全量黄页税；找工具靠已 bind 的 schema。
 * - discovery（用户问「有什么功能」）：再附完整对外清单。
 */
export function buildMerchantCapabilityPrompt(
  activeDefs: ToolDefinition[],
  activePlaybookDefs: PlaybookDefinition[] = [],
  options?: { includeCatalog?: boolean },
): string {
  const includeCatalog = options?.includeCatalog === true;

  const lines = [
    "【Skill 可见性与对外介绍】",
    "Skill 分为 public（对外）与 internal（内部）：",
    "- public：用户问「你有什么功能 / 能做什么」时，只介绍对外能力；不要罗列工具函数名。",
    "- internal：你仍可在用户提出具体需求时调用，但禁止主动介绍、禁止写进功能清单。",
    "- 用户问功能总览时：用简短分组概述即可（每组一两句），系统会在回复下方自动附上可点击的功能按钮（与工作台「推荐」相同）；不要把每个能力写成很长的条目清单，也不要让用户去别处找入口。",
  ];

  if (!includeCatalog) {
    return lines.join("\n");
  }

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

  lines.push("", "对外能力清单（仅这些可展示给用户）：");
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
  /** 本轮是否附带上传文件（有则注入文件上下文说明） */
  hasFileContext?: boolean;
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
  const isDiscovery = isCapabilityOverviewUserIntent(options.userText);
  const parts: string[] = [
    buildShopChatAgentSystemPrompt(locale),
    buildReplyFormattingPrompt(),
    buildAnswerShapePrompt(),
    buildWriteSafetyPrompt(),
    buildToolMutexPrompt(),
    buildPostToolNextStepPrompt(),
  ];

  if (options.hasFileContext) {
    parts.push(buildFileContextCapabilityPrompt());
  }

  const reflectionPrompt = buildReflectionPrompt(options.reflectionSummary);
  if (reflectionPrompt) {
    parts.push(reflectionPrompt);
  }

  parts.push(
    buildMerchantCapabilityPrompt(activeDefs, playbooks, {
      includeCatalog: isDiscovery,
    }),
  );
  if (isDiscovery) {
    parts.push(buildCapabilityFormattingExamplePrompt());
  }

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
