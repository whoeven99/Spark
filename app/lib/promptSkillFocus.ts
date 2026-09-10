/**
 * System prompt 按需注入：把推荐操作 key / 用户话术映射到应注入
 * systemPromptExtension 的 Skill 名，避免每轮灌入全部 Skill 长指令。
 */

/** 推荐操作 key → 需要注入的 SkillDefinition.name（可含下游协作 Skill） */
export const RECOMMEND_KEY_TO_SKILL_NAMES: Record<string, readonly string[]> = {
  todayOverview: ["shopOperations"],
  todayTodos: ["shopOperations", "healthDiagnosisForm"],
  inventoryHealth: ["shopOperations"],
  abandonRefund: ["shopOperations"],
  // SEO 体检后正文过薄可开文案卡；搜索标题/描述缺失或超宽可开批量字段卡
  seoAudit: ["seoAudit", "productImprove", "bulkProductFieldEdit"],
  qualityScore: ["productQualityScore", "productImprove"],
  optimizeCopy: ["productImprove"],
  translateImage: ["pictureTranslateForm", "pictureTranslate"],
  generateImage: ["imageGenerationForm", "imageGeneration"],
  bulkPriceEdit: ["bulkPriceEdit"],
  bulkTagEdit: ["bulkTagEdit"],
  bulkStatusEdit: ["bulkStatusEdit"],
  bulkProductFieldEdit: ["bulkProductFieldEdit"],
  bulkCollectionEdit: ["bulkCollectionEdit"],
  productDuplicate: ["productDuplicate"],
  bulkArchive: ["bulkArchive"],
  productExport: ["productExport"],
};

/** 自由输入时的轻量关键词路由（中英）；命中则注入对应 Skill 组 */
const HEURISTIC_RULES: Array<{ skills: readonly string[]; patterns: RegExp[] }> = [
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.seoAudit,
    patterns: [/seo\s*体检/i, /\bseo\b/i, /搜索引擎优?化/, /搜索标题/, /meta\s*description/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.todayTodos,
    patterns: [/今日待办/, /健康诊断/, /有什么.*风险/, /今天.*要处理/, /店铺.*健康/],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.inventoryHealth,
    patterns: [/库存健康/, /低库存/, /缺货/, /补货/],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.abandonRefund,
    patterns: [/弃购/, /退款率/, /abandoned?\s*checkout/i, /refund\s*rate/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.todayOverview,
    patterns: [/今日经营/, /今天.*销售/, /销售额/, /转化率/, /客单价/, /\baov\b/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.qualityScore,
    patterns: [/质量评分/, /商品页.*分/, /product\s*quality/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.optimizeCopy,
    patterns: [/优化.*文案/, /商品描述/, /改标题/, /product\s*copy/i, /rewrite.*(title|description)/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.translateImage,
    patterns: [/翻译.*图/, /图片.*翻译/, /picture\s*translat/i, /image\s*translat/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.generateImage,
    patterns: [/生成.*主图/, /文生图/, /生成.*商品图/, /generate.*(image|主图)/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkPriceEdit,
    patterns: [/批量调价/, /批量.*改价/, /降价\s*\d/, /涨价\s*\d/, /bulk\s*price/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkTagEdit,
    patterns: [/批量打标/, /批量.*标签/, /bulk\s*tag/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkStatusEdit,
    patterns: [/批量上下架/, /批量.*上架/, /批量.*下架/, /bulk\s*status/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkProductFieldEdit,
    patterns: [
      /批量.*vendor/i,
      /批量.*品牌/,
      /批量.*商品类型/,
      /批量.*seo/i,
      /改.*seo\s*标题/i,
      /bulk\s*(vendor|seo|product\s*type)/i,
    ],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkCollectionEdit,
    patterns: [
      /批量.*合集/,
      /调整.*合集/,
      /加入合集/,
      /移出合集/,
      /加入或移出/,
      /手动合集/,
      /bulk\s*collection/i,
    ],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.productDuplicate,
    patterns: [/复制商品/, /拷贝商品/, /duplicate\s*product/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.bulkArchive,
    patterns: [/归档商品/, /批量归档/, /archive\s*product/i],
  },
  {
    skills: RECOMMEND_KEY_TO_SKILL_NAMES.productExport,
    patterns: [
      /导出商品/,
      /导出已选/,
      /导出确认卡/,
      /导出.*csv/i,
      /export\s*product/i,
      /export confirmation/i,
      /export.*csv/i,
    ],
  },
];

function dedupe(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * 从前端传入的 skillFocus 解析 Skill 名。
 * - 推荐操作 key（如 seoAudit）
 * - 逗号分隔的 Skill 名
 * - 字面量 `all`：注入全部 extension（调试/回退）
 */
export function skillNamesFromFocus(skillFocus: string | null | undefined): string[] | "all" | null {
  const raw = skillFocus?.trim();
  if (!raw) return null;
  if (raw === "all") return "all";

  const fromRecommend = RECOMMEND_KEY_TO_SKILL_NAMES[raw];
  if (fromRecommend) return dedupe(fromRecommend);

  if (raw.includes(",")) {
    return dedupe(raw.split(",").map((s) => s.trim()));
  }

  // 单个 Skill 名
  return dedupe([raw]);
}

/** 自由输入：按关键词命中 Skill 组；未命中返回空数组（只保留全局短提示）。 */
export function skillNamesFromUserText(userText: string | null | undefined): string[] {
  const text = userText?.trim() ?? "";
  if (!text) return [];

  const matched: string[] = [];
  for (const rule of HEURISTIC_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      matched.push(...rule.skills);
    }
  }
  return dedupe(matched);
}

/**
 * 决定本轮要注入 systemPromptExtension 的 Skill 名。
 * 优先显式 skillFocus，其次用户话术启发式；都没有则空（不灌长指令）。
 */
export function resolvePromptSkillNames(options: {
  skillFocus?: string | null;
  userText?: string | null;
}): string[] | "all" {
  const fromFocus = skillNamesFromFocus(options.skillFocus);
  if (fromFocus === "all") return "all";
  if (fromFocus && fromFocus.length > 0) return fromFocus;
  return skillNamesFromUserText(options.userText);
}
