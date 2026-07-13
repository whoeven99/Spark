import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

export interface ProductIssue {
  level: "error" | "warning";
  rule: string;
  message: string;
}

export interface ProductValidationResult {
  productId: string;
  title: string;
  status: "ok" | "warning" | "error";
  issues: ProductIssue[];
}

export interface FeedValidationReport {
  totalProducts: number;
  readyToSync: number; // status === "ok"
  hasWarnings: number; // status === "warning"
  hasErrors: number; // status === "error"
  products: ProductValidationResult[];
}

/**
 * Validate a GTIN/barcode using the standard GS1 mod-10 check digit.
 * Accepts GTIN-8/12/13/14 numeric strings.
 */
export function isValidGtin(value: string): boolean {
  const digits = value.replace(/\s|-/g, "");
  if (!/^\d+$/.test(digits)) return false;
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const nums = digits.split("").map(Number);
  const check = nums.pop() as number;
  // Weight alternates 3/1 from the rightmost data digit.
  let sum = 0;
  for (let i = nums.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += nums[i] * weight;
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

type Rule = {
  rule: string;
  check: (p: RawShopifyProductForCatalog) => boolean;
  message: string;
};

function priceNumber(p: RawShopifyProductForCatalog): number {
  return parseFloat(p.priceAmount ?? "0");
}

function primaryCompareAtPrice(p: RawShopifyProductForCatalog): string | null {
  return p.variants[0]?.compareAtPrice ?? null;
}

function primaryInventoryPolicy(p: RawShopifyProductForCatalog): "DENY" | "CONTINUE" {
  return p.variants[0]?.inventoryPolicy ?? "DENY";
}

/**
 * 判断商品是否属于"服装与配件"大类。
 * GMC 在该类目下（美国、英国、德国、法国、日本、澳大利亚等市场）要求提供
 * color / size / gender / age_group 四个属性，缺失会导致曝光受限。
 *
 * 检测优先级：googleProductCategory 关键词 → productType 关键词 → tags 关键词
 */
function isLikelyApparel(p: RawShopifyProductForCatalog): boolean {
  const apparelPattern =
    /apparel|clothing|fashion|wear|shirt|pant|dress|shoe|boot|sneaker|jacket|coat|hoodie|blouse|skirt|short|jean|sweater|sock|hat|cap|glove|underwear|swimwear|bag|handbag|wallet|jewel|accessori/i;

  const cat = p.googleProductCategory ?? "";
  // Google Taxonomy "Apparel & Accessories" 顶层 ID = 166
  if (/\b166\b/.test(cat) || apparelPattern.test(cat)) return true;

  if (apparelPattern.test(p.productType ?? "")) return true;

  const tagsText = p.tags.join(" ");
  if (apparelPattern.test(tagsText)) return true;

  return false;
}

/** 所有变体中是否至少有一个设置了颜色。 */
function hasAnyColor(p: RawShopifyProductForCatalog): boolean {
  return p.variants.some((v) => Boolean(v.color));
}

/** 所有变体中是否至少有一个设置了尺码。 */
function hasAnySize(p: RawShopifyProductForCatalog): boolean {
  return p.variants.some((v) => Boolean(v.size));
}

// 硬性错误（会被 GMC 直接拒绝，同步时自动跳过）。
// 对应 Google 商品数据规范中标注为「必需属性」的字段：
// https://support.google.com/merchants/answer/7052112
const HARD_RULES: Rule[] = [
  {
    rule: "MISSING_TITLE",
    check: (p) => !p.title,
    message: "缺少商品名 [title]，GMC 必需属性",
  },
  {
    rule: "MISSING_DESCRIPTION",
    check: (p) => !p.descriptionHtml || stripHtml(p.descriptionHtml).length === 0,
    message: "缺少说明 [description]，GMC 必需属性",
  },
  {
    rule: "MISSING_LINK",
    check: (p) => !p.onlineStoreUrl && !p.handle,
    message: "缺少商品链接 [link]，GMC 必需属性，需要可访问的商品页 URL",
  },
  {
    rule: "MISSING_IMAGE",
    check: (p) => !p.featuredImage && p.images.length === 0,
    message: "缺少主图 [image_link]，GMC 必需属性",
  },
  {
    rule: "MISSING_PRICE",
    check: (p) => !p.priceAmount || priceNumber(p) === 0,
    message: "缺少价格 [price] 或价格为 0，GMC 必需属性",
  },
  {
    rule: "MISSING_CURRENCY",
    check: (p) => !p.priceCurrency,
    message: "缺少货币单位，价格 [price] 须附带 ISO 4217 货币代码",
  },
  { rule: "NOT_ACTIVE", check: (p) => p.status !== "ACTIVE", message: "商品未上架（status 非 ACTIVE）" },
];

// 质量警告（可能导致 GMC 后置审核拒绝或降权，提示但不阻断同步）。
const WARNING_RULES: Rule[] = [
  // ── 商品名 [title] 质量 ──────────────────────────────────────
  {
    rule: "TITLE_TOO_SHORT",
    check: (p) => p.title.length > 0 && p.title.length < 5,
    message: "标题过短（建议 ≥ 5 个字符）",
  },
  {
    rule: "TITLE_TOO_LONG",
    // GMC 规范：title 最多 150 个字符
    check: (p) => p.title.length > 150,
    message: "标题超过 150 个字符，超出部分将被 GMC 截断",
  },
  {
    rule: "TITLE_ALL_CAPS",
    check: (p) => p.title.length >= 5 && /^[A-Z\s\d]+$/.test(p.title),
    message: "标题全大写，GMC 会降权",
  },
  // ── 说明 [description] 质量 ──────────────────────────────────
  {
    rule: "DESCRIPTION_TOO_SHORT",
    check: (p) => {
      const plain = stripHtml(p.descriptionHtml);
      return plain.length > 0 && plain.length < 20;
    },
    message: "说明内容过短（去标签后少于 20 字符），建议补充详细描述",
  },
  {
    rule: "DESCRIPTION_TOO_LONG",
    // GMC 规范：description 最多 5000 个字符
    check: (p) => stripHtml(p.descriptionHtml).length > 5000,
    message: "说明内容超过 5000 个字符，超出部分将被 GMC 截断",
  },
  // ── 库存状况 [availability] ──────────────────────────────────
  {
    rule: "MISSING_AVAILABILITY",
    // 商品无任何变体时 availableForSale 为 null，无法确定库存状况
    check: (p) => p.availableForSale === null,
    message: "缺少库存状况 [availability]（商品无有效变体），GMC 必需属性",
  },
  // ── 商品标识符 ────────────────────────────────────────────────
  {
    rule: "INVALID_GTIN",
    // 有 barcode 但不符合 GTIN-8/12/13/14 校验位规则
    check: (p) => Boolean(p.barcode) && !isValidGtin(p.barcode as string),
    message:
      "条形码格式不符合 GTIN 规范（校验位错误），支持 UPC-12、EAN-13、JAN-8/13、ISBN-13、ITF-14",
  },
  {
    rule: "NO_IDENTIFIER",
    // 没有 GTIN（barcode）也没有 MPN（sku），GMC 强烈建议至少提供其中一项
    check: (p) => !p.barcode && !p.sku,
    message:
      "缺少 GTIN [gtin] 和 MPN [mpn]，建议至少填写一项；如商品确实没有唯一标识码，可在 Feed 中设置 identifier_exists=no",
  },
  // ── 品牌 [brand] ─────────────────────────────────────────────
  {
    rule: "NO_BRAND",
    // GMC 规范：所有新商品（电影/图书/音乐除外）必须提供品牌
    check: (p) => !p.vendor,
    message: "缺少品牌 [brand]，GMC 对所有新商品要求必须提供品牌（对应 Shopify vendor 字段）",
  },
  // ── 其他质量提示 ──────────────────────────────────────────────
  {
    rule: "OVERSELL_POLICY",
    check: (p) => p.availableForSale === true && primaryInventoryPolicy(p) === "CONTINUE",
    message: "商品开启了超卖继续销售，建议在 GMC 中将库存状况标记为 preorder 而非 in_stock",
  },
  {
    rule: "HAS_COMPARE_AT_PRICE",
    check: (p) => {
      const compareAt = primaryCompareAtPrice(p);
      return Boolean(compareAt) && parseFloat(compareAt as string) > priceNumber(p);
    },
    message: "商品有划线价，将映射为促销价 [sale_price]，在 GMC 展示促销角标",
  },
  {
    rule: "MULTI_VARIANT",
    check: (p) => p.variantCount > 1,
    message: "多变体商品将按变体逐条推送，并通过 itemGroupId 聚合展示",
  },
  // ── 服装类条件必需属性（美国等市场缺失会导致曝光受限）──────────
  {
    rule: "APPAREL_MISSING_COLOR",
    // 检测为服装类且没有任何变体设置了颜色选项
    check: (p) => isLikelyApparel(p) && !hasAnyColor(p),
    message:
      "服装类商品缺少颜色 [color]，在美国等市场曝光受限。" +
      '请在 Shopify 变体中添加名为 "Color" 或 "颜色" 的选项并填写对应颜色值',
  },
  {
    rule: "APPAREL_MISSING_SIZE",
    // 检测为服装类且没有任何变体设置了尺码选项
    check: (p) => isLikelyApparel(p) && !hasAnySize(p),
    message:
      "服装类商品缺少尺码 [size]，在美国等市场曝光受限。" +
      '请在 Shopify 变体中添加名为 "Size" 或 "尺码" 的选项并填写对应尺码值',
  },
  {
    rule: "APPAREL_MISSING_GENDER",
    // 检测为服装类且未从 tags 提取到 gender
    check: (p) => isLikelyApparel(p) && !p.gender,
    message:
      "服装类商品缺少适用性别 [gender]，在美国等市场曝光受限。" +
      '请在商品 tags 中添加 "gender:male"、"gender:female" 或 "gender:unisex"',
  },
  {
    rule: "APPAREL_MISSING_AGE_GROUP",
    // 检测为服装类且未从 tags 提取到 age_group
    check: (p) => isLikelyApparel(p) && !p.ageGroup,
    message:
      "服装类商品缺少年龄段 [age_group]，在美国等市场曝光受限。" +
      '请在商品 tags 中添加 "age_group:adult"、"age_group:kids" 等（合法值：newborn / infant / toddler / kids / adult）',
  },
];

function evaluate(product: RawShopifyProductForCatalog): ProductValidationResult {
  const issues: ProductIssue[] = [];
  for (const rule of HARD_RULES) {
    if (rule.check(product)) {
      issues.push({ level: "error", rule: rule.rule, message: rule.message });
    }
  }
  for (const rule of WARNING_RULES) {
    if (rule.check(product)) {
      issues.push({ level: "warning", rule: rule.rule, message: rule.message });
    }
  }
  const hasError = issues.some((i) => i.level === "error");
  const hasWarning = issues.some((i) => i.level === "warning");
  return {
    productId: product.id,
    title: product.title,
    status: hasError ? "error" : hasWarning ? "warning" : "ok",
    issues,
  };
}

/**
 * Validate products for Google Merchant Center prior to mapping/sync. Pure,
 * local logic (no GMC request). Reused by both the preview endpoint and the
 * pre-sync interception.
 */
export function validateProductsForGoogle(
  products: RawShopifyProductForCatalog[],
): FeedValidationReport {
  const results = products.map(evaluate);
  return {
    totalProducts: results.length,
    readyToSync: results.filter((r) => r.status === "ok").length,
    hasWarnings: results.filter((r) => r.status === "warning").length,
    hasErrors: results.filter((r) => r.status === "error").length,
    products: results,
  };
}

/** Returns the set of product IDs that have hard errors (skipped on sync). */
export function collectErrorProductIds(report: FeedValidationReport): Set<string> {
  return new Set(report.products.filter((p) => p.status === "error").map((p) => p.productId));
}
