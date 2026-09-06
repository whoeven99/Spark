import { extractUserIntentText } from "./chatCardFallback";

/**
 * 用户是否在问「你有什么功能 / 能做什么」一类总览问题。
 * 命中后服务端会在回复下方附上与工作台推荐同源的可点操作。
 */
const CAPABILITY_OVERVIEW_RE =
  /(你有什么功能|有哪些功能|都有什么功能|能做什么|你会什么|功能介绍|功能清单|你可以帮我(做|干)什么|what can you (do|help)|what (are )?your (features|capabilities)|list (your )?(features|capabilities)|show (me )?(your )?(features|capabilities))/i;

export function isCapabilityOverviewUserIntent(
  lastUserText: string | null | undefined,
): boolean {
  const text = extractUserIntentText(lastUserText ?? "");
  if (!text) return false;
  return CAPABILITY_OVERVIEW_RE.test(text);
}
