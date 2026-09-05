/**
 * 站内 SEO 体检 —— 纯算层。
 *
 * 只吃 Shopify 只读快照，输出结构化问题清单；零 IO、零模型、零 token。
 * 这一层同时是 Spark 的 SEO 知识库：判定阈值、为什么是问题、怎么改，
 * 全部在这里成文，避免把 SEO 经验散落进各处 prompt 字符串。
 *
 * 搜索标题/描述问题目前没有 Spark 内批量改写入口，fixability 记为 manual；
 * 正文过薄走商品文案优化（product_content）。
 */

/* ── 显示宽度 ───────────────────────────────────────────────
 * Google 按**像素宽度**截断搜索结果，不是按字符数。一个 CJK 字符的渲染宽度
 * 约等于两个半角字符，所以中文店按「60 个字符」判断会严重低估，
 * 30 个汉字的标题实际上已经到截断线了。这里统一折算成半角当量再比阈值。
 */

const FULL_WIDTH_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f], // 韩文字母
  [0x2e80, 0xa4cf], // CJK 部首 / 汉字 / 假名
  [0xac00, 0xd7a3], // 韩文音节
  [0xf900, 0xfaff], // CJK 兼容汉字
  [0xfe30, 0xfe6f], // CJK 兼容标点
  [0xff00, 0xff60], // 全角字母数字与标点
  [0xffe0, 0xffe6], // 全角货币符号
];

function isFullWidth(codePoint: number): boolean {
  return FULL_WIDTH_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** 半角当量宽度：CJK / 全角字符记 2，其余记 1。 */
export function seoDisplayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    width += isFullWidth(codePoint) ? 2 : 1;
  }
  return width;
}

/* ── 阈值 ─────────────────────────────────────────────── */

/** 超过这个宽度，标题在搜索结果里会被截断。 */
export const SEO_TITLE_MAX_WIDTH = 60;
/** 低于这个宽度说明没把展位用满，等于白白丢掉关键词位置。 */
export const SEO_TITLE_MIN_WIDTH = 30;
export const SEO_DESCRIPTION_MAX_WIDTH = 160;
export const SEO_DESCRIPTION_MIN_WIDTH = 70;
/** 正文纯文本短于此长度，搜索引擎几乎没有可索引内容（thin content）。 */
export const SEO_BODY_MIN_LENGTH = 100;
/** handle 过长会让 URL 在搜索结果里被省略号截断。 */
export const SEO_HANDLE_MAX_LENGTH = 75;

/** 单个问题最多带几个样例商品，够 AI 举例即可，不撑爆上下文。 */
export const SEO_AUDIT_SAMPLES_PER_ISSUE = 5;

/* ── 类型 ─────────────────────────────────────────────── */

export const SEO_AUDIT_ISSUE_CODES = [
  "title_duplicated",
  "description_duplicated",
  "title_missing",
  "description_missing",
  "title_too_long",
  "handle_non_descriptive",
  "body_too_thin",
  "description_too_long",
  "title_too_short",
  "description_too_short",
] as const;

export type SeoAuditIssueCode = (typeof SEO_AUDIT_ISSUE_CODES)[number];

export type SeoAuditSeverity = "high" | "medium" | "low";

/** 这个问题能不能用 Spark 现有能力修。 */
export type SeoAuditFixability =
  /** 要改的是商品正文，走商品文案优化 */
  | "product_content"
  /** 没有安全的批量改法，只能人工逐个处理 */
  | "manual";

export type SeoAuditProductInput = {
  productId: string;
  productTitle: string;
  handle: string;
  /** null 表示未上架；未上架商品不进入 SEO 判定 */
  publishedAt: string | null;
  /** 正文纯文本，读侧已截断，只用于判断「够不够长」 */
  descriptionText: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type SeoAuditSample = {
  productId: string;
  productTitle: string;
  handle: string;
  /** 触发该问题的当前取值（标题/描述/handle），便于 AI 举例说明 */
  currentValue: string | null;
  /** 该取值的显示宽度，仅长度类问题有意义 */
  currentWidth?: number;
};

export type SeoAuditIssue = {
  code: SeoAuditIssueCode;
  severity: SeoAuditSeverity;
  affectedCount: number;
  samples: SeoAuditSample[];
  /** 该问题特有的量化补充，如重复组数 */
  metrics?: Record<string, number>;
  fixability: SeoAuditFixability;
};

export type SeoAuditSummary = {
  /** 读到的商品总数（含未上架） */
  scannedProducts: number;
  /** 实际参与判定的已上架商品数 */
  auditedProducts: number;
  /** 因未上架被跳过的商品数 */
  unpublishedProducts: number;
  /** 因为撞到读取上限，店里还有商品没被扫到 */
  truncated: boolean;
  /** 自定义了 SEO 标题的已上架商品占比，0-100 */
  titleCoverage: number;
  descriptionCoverage: number;
  /** 至少命中一条问题的商品数 */
  productsWithIssues: number;
  highSeverityIssues: number;
};

export type SeoAuditResult = {
  summary: SeoAuditSummary;
  issues: SeoAuditIssue[];
};

/* ── 知识库：为什么是问题 + 怎么改 ─────────────────────────
 * 这份文案会随体检结果一起交给模型，作为它给建议时的事实依据，
 * 目的是让模型说出「有依据的具体建议」，而不是泛泛的 SEO 套话。
 */

export type SeoAuditGuidance = {
  /** 一句话说清这是什么问题 */
  title: string;
  /** 为什么它会伤到搜索表现 */
  why: string;
  /** 具体怎么改 */
  howTo: string;
  /** 给商户看的改写示例 */
  example: string;
};

export const SEO_AUDIT_GUIDANCE: Record<SeoAuditIssueCode, SeoAuditGuidance> = {
  title_duplicated: {
    title: "多个商品的搜索标题完全相同",
    why: "标题相同的页面在搜索引擎眼里高度相似，会互相抢同一个关键词的排名（关键词自食），最后往往哪个都排不上去；严重时还会被判定为重复内容而只收录其中一个。",
    howTo:
      "给每个商品的标题补上能区分彼此的信息：型号、规格、颜色、容量、适用机型。区分信息要放在标题前半段，因为搜索结果会从右侧截断。",
    example:
      "把三个都叫「无线蓝牙耳机」的商品，改成「无线蓝牙耳机 A1 降噪版 · 30 小时续航」「无线蓝牙耳机 A2 运动款 · IPX7 防水」这种带型号和卖点的写法。",
  },
  description_duplicated: {
    title: "多个商品的搜索描述完全相同",
    why: "描述是搜索结果里那段说明文字，直接决定用户点不点。整店共用一段模板描述时，用户在结果页看到几条一模一样的说明，无法判断该点哪个，点击率会明显偏低。",
    howTo:
      "描述里至少要有一句是这个商品独有的：解决什么具体问题、和同系列其它款的区别、关键参数。剩下的品牌话术可以复用。",
    example:
      "统一的「优质材料，全球包邮，30 天退换」后面补上「这款是 45L 大容量版，可放下 17 寸笔记本」。",
  },
  title_missing: {
    title: "没有自定义搜索标题，正在回落到商品名",
    why: "没填时 Shopify 会用「商品名 – 店铺名」当搜索标题。商品名是给店内买家看的，通常不含买家在 Google 上真正会搜的词；再加上店铺名后缀，很容易超长被截断，把关键词挤掉。",
    howTo:
      "写一条独立的搜索标题：把买家最可能搜的词放在最前面，然后是品牌或型号，控制在 60 个半角当量（约 30 个汉字）以内。",
    example: "商品名叫「Aurora 系列 · 春日限定」，搜索标题改成「真丝方巾 春季新款 · Aurora 系列」。",
  },
  description_missing: {
    title: "没有填写搜索描述",
    why: "留空时搜索引擎会自己从页面里抓一段文字来显示，抓到的经常是导航、运费说明或者一句不完整的话。这段文字是用户点进来之前唯一能看到的说明，放弃它等于放弃了对点击率的控制。",
    howTo: "用 70–160 个半角当量写清楚三件事：卖的是什么、对谁有用、为什么值得点。结尾给一个明确的行动理由。",
    example: "「防水登山背包，45L 大容量，可放 17 寸笔记本。通勤和周末徒步都能用，现在下单享 30 天无理由退换。」",
  },
  title_too_long: {
    title: "搜索标题过长，会在搜索结果里被截断",
    why: "超出显示宽度的部分会被省略号吃掉。被截断本身不直接扣排名，但如果关键词或品牌名正好落在被截的那一段，用户就看不到了，点击率随之下降。",
    howTo: "把最重要的关键词移到最前面，删掉「正品保证」「热卖爆款」这类不带信息量的形容词，压到 60 个半角当量以内。",
    example: "「2024 全新升级款超轻便携防水户外登山双肩背包男女通用大容量」精简为「防水登山背包 45L · 超轻便携」。",
  },
  handle_non_descriptive: {
    title: "商品链接（handle）不可读",
    why: "handle 就是商品页 URL 的最后一段，会原样显示在搜索结果里，也是搜索引擎判断页面主题的一个信号。带 copy-of、随机字符或百分号编码的链接既不传递任何关键词，看起来也不可信。",
    howTo:
      "改成 3–5 个英文单词的短横线连写，包含核心关键词。注意：改 handle 会让旧链接失效，必须同时在 Shopify 后台配好 301 跳转，所以要逐个确认，不能批量改。",
    example: "把 /products/copy-of-untitled-product-2 改成 /products/waterproof-hiking-backpack-45l。",
  },
  body_too_thin: {
    title: "商品正文内容过少",
    why: "正文是搜索引擎判断页面主题和相关性的主要依据。只有一两句话的页面属于「内容过薄」，既排不上长尾词，也无法回答买家在下单前的疑问。",
    howTo:
      "补齐材质、尺寸规格、使用场景、适配范围、保养方式这几块。写给人看，自然带到关键词即可，不要堆砌。",
    example: "从「优质好货，欢迎选购」扩展成含材质、三档尺寸对照表、适用场景和洗涤说明的完整描述。",
  },
  description_too_long: {
    title: "搜索描述过长，尾部会被截断",
    why: "超出部分会被省略号截掉。影响比标题超长小，但如果行动号召写在最后，用户就看不到了。",
    howTo: "压到 160 个半角当量以内，把最有说服力的一句提到前面。",
    example: "把结尾的「现在下单享 30 天无理由退换」提到第一句之后。",
  },
  title_too_short: {
    title: "搜索标题偏短，展位没用满",
    why: "搜索结果给标题的宽度是固定的，写得短不会扣分，但等于主动放弃了一块可以放关键词和卖点的位置。",
    howTo: "在不堆砌的前提下补一个限定词：适用人群、核心规格或品牌名。",
    example: "「登山包」补成「防水登山背包 45L · 男女通用」。",
  },
  description_too_short: {
    title: "搜索描述偏短，说服力不足",
    why: "太短的描述讲不清差异点，用户在结果页缺少点进来的理由。",
    howTo: "补到 70 个半角当量以上，至少覆盖「是什么 + 对谁有用 + 为什么现在买」。",
    example: "「优质背包」扩展成「防水登山背包，45L 大容量，通勤徒步两用，30 天无理由退换」。",
  },
};

const SEVERITY_BY_CODE: Record<SeoAuditIssueCode, SeoAuditSeverity> = {
  title_duplicated: "high",
  description_duplicated: "high",
  title_missing: "medium",
  description_missing: "medium",
  title_too_long: "medium",
  handle_non_descriptive: "medium",
  body_too_thin: "medium",
  description_too_long: "low",
  title_too_short: "low",
  description_too_short: "low",
};

const FIXABILITY_BY_CODE: Record<SeoAuditIssueCode, SeoAuditFixability> = {
  title_duplicated: "manual",
  description_duplicated: "manual",
  title_missing: "manual",
  description_missing: "manual",
  title_too_long: "manual",
  description_too_long: "manual",
  title_too_short: "manual",
  description_too_short: "manual",
  body_too_thin: "product_content",
  // 改 handle 会断链接、需要配 301，没有安全的批量改法
  handle_non_descriptive: "manual",
};

const SEVERITY_ORDER: Record<SeoAuditSeverity, number> = { high: 0, medium: 1, low: 2 };

/* ── handle 判定 ───────────────────────────────────────── */

/** Shopify 复制商品时生成的默认 handle。 */
const COPY_HANDLE_PATTERN = /(^copy-of-|-copy(-\d+)?$)/;
const UNTITLED_HANDLE_PATTERN = /untitled/;
/** 尾巴上挂的随机串，如 -1a2b3c4d、-1699999999。 */
const RANDOM_SUFFIX_PATTERN = /-[0-9a-f]{8,}$/;
const ALL_NUMERIC_PATTERN = /^\d+$/;
/** 非 ASCII handle 被浏览器百分号编码后完全不可读。 */
const PERCENT_ENCODED_PATTERN = /%[0-9a-fA-F]{2}/;

export function isNonDescriptiveHandle(handle: string): boolean {
  const value = handle.trim().toLowerCase();
  if (!value) return true;
  if (COPY_HANDLE_PATTERN.test(value)) return true;
  if (UNTITLED_HANDLE_PATTERN.test(value)) return true;
  if (RANDOM_SUFFIX_PATTERN.test(value)) return true;
  if (ALL_NUMERIC_PATTERN.test(value)) return true;
  if (PERCENT_ENCODED_PATTERN.test(value)) return true;
  if (value.length > SEO_HANDLE_MAX_LENGTH) return true;
  return false;
}

/* ── 体检 ─────────────────────────────────────────────── */

function normalizeForDuplicate(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toSample(
  product: SeoAuditProductInput,
  currentValue: string | null,
  withWidth: boolean,
): SeoAuditSample {
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    handle: product.handle,
    currentValue,
    ...(withWidth && currentValue !== null ? { currentWidth: seoDisplayWidth(currentValue) } : {}),
  };
}

type Collector = Map<SeoAuditIssueCode, { samples: SeoAuditSample[]; count: number }>;

function collect(
  collector: Collector,
  code: SeoAuditIssueCode,
  sample: SeoAuditSample,
): void {
  const entry = collector.get(code) ?? { samples: [], count: 0 };
  entry.count += 1;
  if (entry.samples.length < SEO_AUDIT_SAMPLES_PER_ISSUE) entry.samples.push(sample);
  collector.set(code, entry);
}

/**
 * 跑一遍站内 SEO 体检。
 *
 * 只判定**已上架**商品：未上架的页面不会被搜索引擎收录，把它们算进覆盖率
 * 只会让结论失真，商户还会照着去改一批根本不影响搜索的商品。
 */
export function runSeoAudit(
  products: SeoAuditProductInput[],
  options: { truncated?: boolean } = {},
): SeoAuditResult {
  const audited = products.filter((product) => product.publishedAt !== null);
  const collector: Collector = new Map();
  const productsWithIssues = new Set<string>();

  const markIssue = (
    code: SeoAuditIssueCode,
    product: SeoAuditProductInput,
    currentValue: string | null,
    withWidth = false,
  ) => {
    collect(collector, code, toSample(product, currentValue, withWidth));
    productsWithIssues.add(product.productId);
  };

  let titleFilled = 0;
  let descriptionFilled = 0;

  /*
   * 重复判定的两个口径不一样，这不是笔误：
   * 标题为空时 Shopify 会回落到商品名，所以「实际渲染出来的标题」才是会打架的那个，
   * 要带回落值一起比；描述为空时输出什么由主题决定，我们无从得知，
   * 所以只比商户明确填过的值，避免把一堆空描述报成「重复」。
   */
  const titleGroups = new Map<string, SeoAuditProductInput[]>();
  const descriptionGroups = new Map<string, SeoAuditProductInput[]>();

  for (const product of audited) {
    const seoTitle = product.seoTitle?.trim() || null;
    const seoDescription = product.seoDescription?.trim() || null;

    if (seoTitle) titleFilled += 1;
    else markIssue("title_missing", product, product.productTitle);

    if (seoDescription) descriptionFilled += 1;
    else markIssue("description_missing", product, null);

    if (seoTitle) {
      const width = seoDisplayWidth(seoTitle);
      if (width > SEO_TITLE_MAX_WIDTH) markIssue("title_too_long", product, seoTitle, true);
      else if (width < SEO_TITLE_MIN_WIDTH) markIssue("title_too_short", product, seoTitle, true);
    }

    if (seoDescription) {
      const width = seoDisplayWidth(seoDescription);
      if (width > SEO_DESCRIPTION_MAX_WIDTH) {
        markIssue("description_too_long", product, seoDescription, true);
      } else if (width < SEO_DESCRIPTION_MIN_WIDTH) {
        markIssue("description_too_short", product, seoDescription, true);
      }
    }

    if (isNonDescriptiveHandle(product.handle)) {
      markIssue("handle_non_descriptive", product, product.handle);
    }

    if (product.descriptionText.trim().length < SEO_BODY_MIN_LENGTH) {
      markIssue("body_too_thin", product, null);
    }

    const effectiveTitle = seoTitle ?? product.productTitle.trim();
    if (effectiveTitle) {
      const key = normalizeForDuplicate(effectiveTitle);
      titleGroups.set(key, [...(titleGroups.get(key) ?? []), product]);
    }
    if (seoDescription) {
      const key = normalizeForDuplicate(seoDescription);
      descriptionGroups.set(key, [...(descriptionGroups.get(key) ?? []), product]);
    }
  }

  const countDuplicates = (
    groups: Map<string, SeoAuditProductInput[]>,
    code: SeoAuditIssueCode,
    valueOf: (product: SeoAuditProductInput) => string | null,
  ): number => {
    let groupCount = 0;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      groupCount += 1;
      for (const product of group) markIssue(code, product, valueOf(product));
    }
    return groupCount;
  };

  const titleDuplicateGroups = countDuplicates(
    titleGroups,
    "title_duplicated",
    (product) => product.seoTitle?.trim() || product.productTitle.trim(),
  );
  const descriptionDuplicateGroups = countDuplicates(
    descriptionGroups,
    "description_duplicated",
    (product) => product.seoDescription?.trim() ?? null,
  );

  const issues: SeoAuditIssue[] = [];
  for (const [code, entry] of collector) {
    const metrics =
      code === "title_duplicated"
        ? { duplicateGroups: titleDuplicateGroups }
        : code === "description_duplicated"
          ? { duplicateGroups: descriptionDuplicateGroups }
          : undefined;
    issues.push({
      code,
      severity: SEVERITY_BY_CODE[code],
      affectedCount: entry.count,
      samples: entry.samples,
      fixability: FIXABILITY_BY_CODE[code],
      ...(metrics ? { metrics } : {}),
    });
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return bySeverity !== 0 ? bySeverity : b.affectedCount - a.affectedCount;
  });

  const ratio = (filled: number) =>
    audited.length === 0 ? 0 : Math.round((filled / audited.length) * 100);

  return {
    summary: {
      scannedProducts: products.length,
      auditedProducts: audited.length,
      unpublishedProducts: products.length - audited.length,
      truncated: options.truncated ?? false,
      titleCoverage: ratio(titleFilled),
      descriptionCoverage: ratio(descriptionFilled),
      productsWithIssues: productsWithIssues.size,
      highSeverityIssues: issues.filter((issue) => issue.severity === "high").length,
    },
    issues,
  };
}
