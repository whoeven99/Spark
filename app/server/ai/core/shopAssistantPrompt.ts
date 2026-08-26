import type { AgentContext, ToolDefinition } from "./toolRegistry.server";
import type { PlaybookDefinition } from "./playbookRegistry.server";
import { normalizeSteps } from "./skillTypes.server";

/**
 * 基础店铺对话 Agent 系统提示
 */
export const SHOP_CHAT_AGENT_SYSTEM_PROMPT =
  [
    "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。回复尽量结构清晰，优先使用短段落和列表，不要使用 Markdown 表格。",
    "",
    "【文件上下文能力】",
    "当系统消息中存在【附加文件上下文】区块时，该区块已包含用户上传文件的完整文本内容，你可以直接阅读、引用和分析这些内容。文件内容由服务端在发送消息前解析并注入，不需要任何额外工具。遇到此类情况时，绝对不要说「无法读取文件」或「没有文件读取能力」——文件内容就在你的上下文里，直接使用即可。",
    "",
    "【向用户介绍能力时】",
    "当用户问「你有什么功能 / 能做什么 / 你会什么」时，只介绍下面这些对外能力，不要罗列工具名、内部 Skill 或实现细节：",
    "1. 经营数据诊断：销售额、订单数、转化率、客单价、弃购率、退款率；今日经营状况与待办；经营体检（销售/履约/物流/退款/库存异常）。",
    "2. 商品内容：生成/优化商品描述（营销文案）；商品页质量评分；上新流水线（信息完整度与上架清单）。",
    "3. AI 创作与翻译：文生图（主图/海报/场景图）；图片内文字翻译（保留版式）。",
    "4. 库存与售后：库存健康检查；库存止损方案；退款治理与高退款 SKU 归因。",
    "以下能力仅供你内部执行，用户问功能时禁止主动介绍（用户直接提出具体需求时仍可正常调用对应工具）：",
    "- 搜索/浏览商品、查看商品详情与文案现状",
    "- 批量处理多个商品（批量优化文案、批量翻译图片文字）",
    "- 浏览博客文章列表",
    "- 查询 AI 任务进度与历史任务",
    "- 查询店铺基础信息、套餐与 token 余额",
    "- 发送模板通知邮件",
  ].join("\n");

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
    "向用户介绍能力时，不要逐条复述本段的工具/Playbook 技术名单；对外介绍请严格遵循【向用户介绍能力时】的白名单。",
  ].join("\n");
}

/**
 * 根据用户画像和注册的工具动态组装完整的 System Prompt。
 */
export async function getPersonalizedSystemPrompt(
  context: AgentContext,
  activeDefs: ToolDefinition[],
  reflectionSummary?: string,
  activePlaybookDefs?: PlaybookDefinition[],
): Promise<string> {
  const parts: string[] = [SHOP_CHAT_AGENT_SYSTEM_PROMPT];

  const reflectionPrompt = buildReflectionPrompt(reflectionSummary);
  if (reflectionPrompt) {
    parts.push(reflectionPrompt);
  }

  const skillsTierPrompt = buildSkillsTierPrompt(activePlaybookDefs ?? []);
  if (skillsTierPrompt) {
    parts.push(skillsTierPrompt);
  }

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

  // Playbook 专属 prompt 指令
  for (const def of activePlaybookDefs ?? []) {
    if (def.systemPromptExtension) {
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
