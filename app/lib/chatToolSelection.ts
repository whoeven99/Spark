/**
 * 每轮对话的工具子集选择。
 *
 * 背景：ReAct Agent 每轮都会把所有 active 工具的 schema 塞进模型输入，工具越多，
 * 输入 token 越贵、选错工具的概率越高。这里把「重型 / 专用」能力做成按需绑定：
 * 只有当 skillFocus 或最近几轮用户话术命中时才绑定；通用 / 系统 / 目录类始终绑定。
 *
 * 说明：
 * - 判定复用 promptSkillFocus 的关键词路由（与 systemPrompt 按需注入同一套映射）。
 * - 未被列入 gated 的 skill 一律始终绑定（新增 skill 默认不会被误裁）。
 * - 能力清单 prompt 仍列全部能力，本裁剪只影响真正 bind 给模型的工具。
 */
import { resolvePromptSkillNames } from "./promptSkillFocus";

/**
 * 「重型 / 专用」skill 名：仅在本轮命中意图时才绑定。
 * 覆盖批量编辑 / 表格导入族、图片生成 / 翻译、商品文案 / 质量评分。
 * 其余（店铺经营、店铺信息、时间天气、商品目录、任务 / 计费 / 邮件、健康诊断、批量任务开卡）始终绑定。
 */
export const TURN_GATED_SKILL_NAMES: ReadonlySet<string> = new Set([
  "bulkPriceEdit",
  "bulkTagEdit",
  "bulkStatusEdit",
  "bulkCollectionEdit",
  "bulkSeoEdit",
  "bulkMetafieldEdit",
  "bulkPriceImport",
  "bulkCostImport",
  "bulkInventoryImport",
  "sheetImport",
  "seoAudit",
  "imageGenerationForm",
  "imageGeneration",
  "pictureTranslateForm",
  "pictureTranslate",
  "productImprove",
  "productQualityScore",
]);

/** 工具裁剪总开关；设 `CHAT_TOOL_TRIM=false` 可回退到全量绑定。 */
export function isChatToolTrimEnabled(): boolean {
  return process.env.CHAT_TOOL_TRIM !== "false";
}

/**
 * 计算本轮应「激活」的 gated skill 集合；返回 "all" 表示不裁剪（skillFocus=all 或调试回退）。
 */
export function selectActiveGatedSkills(params: {
  skillFocus?: string | null;
  recentUserText?: string | null;
}): Set<string> | "all" {
  const names = resolvePromptSkillNames({
    skillFocus: params.skillFocus,
    userText: params.recentUserText,
  });
  if (names === "all") return "all";
  return new Set(names);
}

/** 判断某个 skill 名本轮是否应绑定给模型。 */
export function shouldBindSkillForTurn(
  skillName: string,
  activeGated: Set<string> | "all",
): boolean {
  if (activeGated === "all") return true;
  if (!TURN_GATED_SKILL_NAMES.has(skillName)) return true;
  return activeGated.has(skillName);
}
