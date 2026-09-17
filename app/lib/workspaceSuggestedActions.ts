import { isCapabilityOverviewUserIntent } from "./capabilityActionsIntent";
import { extractUserIntentText } from "./chatCardFallback";
import { skillNamesFromUserText } from "./promptSkillFocus";
import type { WorkspaceRecommendedGroup } from "./workspaceRecommendedActions";

/**
 * 回复下方可点操作：
 * - true：功能总览，展示全部推荐
 * - { keys }：按对话过滤后的推荐 key
 */
export type WorkspaceActionsPayload = true | { keys: string[] };

/** 工作台推荐里实际露出的 key（含广告两项）。 */
export const WORKSPACE_ACTION_KEYS = [
  "todayPulse",
  "seoAudit",
  "connectAds",
  "viewAdsPerformance",
  "qualityScore",
  "optimizeCopy",
  "translateImage",
  "generateImage",
  "productExport",
  "productImport",
  "bulkPriceEdit",
  "bulkTagEdit",
  "bulkStatusEdit",
] as const;

export type WorkspaceActionKey = (typeof WORKSPACE_ACTION_KEYS)[number];

const ACTION_KEY_SET = new Set<string>(WORKSPACE_ACTION_KEYS);

const SKILL_TO_ACTION_KEYS: Record<string, readonly WorkspaceActionKey[]> = {
  shopOperations: ["todayPulse"],
  healthDiagnosisForm: ["todayPulse"],
  seoAudit: ["seoAudit", "optimizeCopy"],
  productImprove: ["optimizeCopy"],
  productQualityScore: ["qualityScore", "optimizeCopy"],
  pictureTranslateForm: ["translateImage"],
  pictureTranslate: ["translateImage"],
  imageGenerationForm: ["generateImage"],
  imageGeneration: ["generateImage"],
  productExport: ["productExport"],
  productImport: ["productImport"],
  bulkPriceEdit: ["bulkPriceEdit"],
  bulkTagEdit: ["bulkTagEdit"],
  bulkStatusEdit: ["bulkStatusEdit"],
};

const EXTRA_HINTS: Array<{ keys: readonly WorkspaceActionKey[]; patterns: RegExp[] }> = [
  {
    keys: ["todayPulse", "seoAudit"],
    patterns: [
      /店铺.*(怎么样|如何|近况|好不好)/,
      /店里.*(怎么样|如何)/,
      /目前怎么样/,
      /经营.*(怎么样|如何|建议)/,
      /怎么(提高|提升).*(销量|转化|流量)/,
      /how('s| is) (my |the )?store/i,
      /how is (the )?business/i,
    ],
  },
  {
    keys: ["todayPulse", "seoAudit", "optimizeCopy"],
    patterns: [
      /多卖/,
      /卖得?更好/,
      /卖不动/,
      /没有?人买/,
      /提(升|高).{0,4}销(量|售)/,
      /销(量|售).{0,4}(提升|提高|上不去|下滑)/,
      /(sell more|grow sales|increase sales|boost sales)/i,
    ],
  },
  {
    // 方向明确、动作有多条路：只给商品优化这一组，让用户选
    keys: ["qualityScore", "optimizeCopy", "translateImage"],
    patterns: [
      /商品(页|页面|详情).{0,6}(更好|优化|提升|改进|完善)/,
      /(优化|提升|改进|完善).{0,6}商品(页|页面|详情)/,
      /(improve|optimi[sz]e).{0,12}product\s*(page|detail)/i,
    ],
  },
  {
    keys: ["connectAds", "viewAdsPerformance"],
    patterns: [/广告/, /\bads?\b/i, /meta|facebook|tiktok|google ads/i],
  },
];

function dedupeKeys(keys: readonly string[]): WorkspaceActionKey[] {
  const seen = new Set<string>();
  const out: WorkspaceActionKey[] = [];
  for (const key of keys) {
    if (!ACTION_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as WorkspaceActionKey);
  }
  return out;
}

/** 从用户话术选出相关推荐 key；对不上则空（宁缺勿滥）。 */
export function selectSuggestedActionKeys(
  userText: string | null | undefined,
): WorkspaceActionKey[] {
  const text = extractUserIntentText(userText ?? "");
  if (!text) return [];

  const fromSkills = skillNamesFromUserText(text).flatMap(
    (name) => SKILL_TO_ACTION_KEYS[name] ?? [],
  );
  const fromHints = EXTRA_HINTS.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).flatMap((rule) => rule.keys);

  return dedupeKeys([...fromSkills, ...fromHints]).slice(0, 6);
}

export function parseWorkspaceActionsPayload(
  raw: unknown,
): WorkspaceActionsPayload | null {
  if (raw === true) return true;
  if (raw === false || raw == null) return null;
  if (typeof raw === "object") {
    const keys = (raw as { keys?: unknown }).keys;
    if (!Array.isArray(keys)) return null;
    const normalized = dedupeKeys(keys.filter((item): item is string => typeof item === "string"));
    return normalized.length > 0 ? { keys: normalized } : null;
  }
  return null;
}

export function workspaceActionsActionKeys(
  payload: WorkspaceActionsPayload | null | undefined,
): "all" | WorkspaceActionKey[] | null {
  if (payload === true) return "all";
  if (payload && typeof payload === "object" && payload.keys.length > 0) {
    return payload.keys as WorkspaceActionKey[];
  }
  return null;
}

export function filterWorkspaceRecommendedGroups(
  groups: WorkspaceRecommendedGroup[],
  actionKeys: "all" | readonly string[] | null,
): WorkspaceRecommendedGroup[] {
  if (actionKeys === "all" || actionKeys == null) return groups;
  const allow = new Set(actionKeys);
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allow.has(item.key)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * 本轮要不要在回复下挂推荐按钮。
 * 已开卡 / 本轮已是点推荐进来 → 不挂；功能总览挂全部；
 * 其余优先用模型 suggest_next_actions 选的 key，模型没给才退回话术过滤。
 */
export function resolveWorkspaceActionsForTurn(params: {
  userText?: string | null;
  skillFocus?: string | null;
  cardOpened?: boolean;
  /** 模型本轮通过 suggest_next_actions 选的方向 */
  modelPicked?: WorkspaceActionsPayload | null;
}): WorkspaceActionsPayload | null {
  if (params.cardOpened) return null;
  if (params.skillFocus?.trim()) return null;
  if (isCapabilityOverviewUserIntent(params.userText)) return true;
  if (params.modelPicked) return params.modelPicked;
  const keys = selectSuggestedActionKeys(params.userText);
  return keys.length > 0 ? { keys } : null;
}
