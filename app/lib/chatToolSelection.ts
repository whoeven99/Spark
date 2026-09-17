/**
 * 每轮对话的工具子集选择。
 *
 * 背景：ReAct Agent 每轮都会把所有 active 工具的 schema 塞进模型输入，工具越多，
 * 输入 token 越贵、选错工具的概率越高。
 *
 * 策略：
 * - **显式 skillFocus**（点推荐 / 调试 `all`）：只绑定命中的重型 Skill，省 token。
 * - **自由输入**（无 skillFocus）：全量绑定，由模型选工具；禁止用正则预裁，
 *   否则漏召回时模型根本看不到对应工具。
 *
 * 产品硬约束：自然语言提问时，所有关联 Skill / 其工具都必须对模型可见
 *（可合并同构工具减 schema，但不得因「优化」藏掉相关能力）。
 *
 * 说明：
 * - 长 systemPromptExtension 仍可由 promptSkillFocus 按话术按需注入（与工具 bind 解耦）。
 * - 未被列入 gated 的 skill 一律始终绑定（新增 skill 默认不会被误裁）。
 * - 能力清单 prompt 仍列全部能力，本裁剪只影响真正 bind 给模型的工具。
 */
import { skillNamesFromFocus } from "./promptSkillFocus";

/**
 * 「重型 / 专用」skill 名：仅在显式 skillFocus 命中时才收窄绑定。
 * 覆盖批量编辑、图片生成 / 翻译、商品文案 / 质量评分。
 * 其余（店铺经营、店铺信息、时间天气、商品目录、任务 / 计费 / 邮件、健康诊断、批量任务开卡）始终绑定。
 */
export const TURN_GATED_SKILL_NAMES: ReadonlySet<string> = new Set([
  "bulkPriceEdit",
  "bulkTagEdit",
  "bulkStatusEdit",
  "seoAudit",
  "imageGenerationForm",
  "imageGeneration",
  "pictureTranslateForm",
  "pictureTranslate",
  "productImprove",
  "productQualityScore",
  "productImport",
]);

/** 工具裁剪总开关；设 `CHAT_TOOL_TRIM=false` 可回退到全量绑定。 */
export function isChatToolTrimEnabled(): boolean {
  return process.env.CHAT_TOOL_TRIM !== "false";
}

/**
 * 计算本轮应「激活」的 gated skill 集合；返回 "all" 表示不裁剪。
 *
 * - skillFocus=all 或未传 skillFocus（自由输入）→ "all"
 * - 有推荐 key / Skill 名 → 只激活对应集合
 */
export function selectActiveGatedSkills(params: {
  skillFocus?: string | null;
  /**
   * @deprecated 自由输入不再用话术预裁工具；保留参数以免旧调用方报错。
   */
  recentUserText?: string | null;
}): Set<string> | "all" {
  const fromFocus = skillNamesFromFocus(params.skillFocus);
  if (fromFocus === "all") return "all";
  if (fromFocus && fromFocus.length > 0) return new Set(fromFocus);
  // 自由输入：全量 bind，交给模型选工具。
  return "all";
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
