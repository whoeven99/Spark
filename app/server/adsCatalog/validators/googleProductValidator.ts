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

// 硬性错误（会被 GMC 直接拒绝，同步时自动跳过）。
const HARD_RULES: Rule[] = [
  {
    rule: "MISSING_LINK",
    check: (p) => !p.onlineStoreUrl && !p.handle,
    message: "缺少商品链接，GMC 必须有可访问的商品页 URL",
  },
  {
    rule: "MISSING_IMAGE",
    check: (p) => !p.featuredImage && p.images.length === 0,
    message: "缺少主图，GMC 必须有图片",
  },
  {
    rule: "MISSING_PRICE",
    check: (p) => !p.priceAmount || priceNumber(p) === 0,
    message: "缺少价格或价格为 0",
  },
  { rule: "MISSING_TITLE", check: (p) => !p.title, message: "缺少标题" },
  { rule: "MISSING_CURRENCY", check: (p) => !p.priceCurrency, message: "缺少货币单位" },
  { rule: "NOT_ACTIVE", check: (p) => p.status !== "ACTIVE", message: "商品未上架" },
];

// 质量警告（可能导致 GMC 后置审核拒绝，提示但不阻断同步）。
const WARNING_RULES: Rule[] = [
  {
    rule: "TITLE_TOO_SHORT",
    check: (p) => p.title.length > 0 && p.title.length < 5,
    message: "标题过短（建议 ≥ 5 个字符）",
  },
  {
    rule: "TITLE_ALL_CAPS",
    check: (p) => p.title.length >= 5 && /^[A-Z\s\d]+$/.test(p.title),
    message: "标题全大写，GMC 会降权",
  },
  {
    rule: "NO_DESCRIPTION",
    check: (p) => !p.descriptionHtml,
    message: "缺少描述，GMC 要求有商品描述",
  },
  {
    rule: "DESCRIPTION_TOO_SHORT",
    check: (p) => Boolean(p.descriptionHtml) && stripHtml(p.descriptionHtml).length < 20,
    message: "描述内容过短（去标签后少于 20 字符）",
  },
  {
    rule: "INVALID_GTIN",
    check: (p) => Boolean(p.barcode) && !isValidGtin(p.barcode as string),
    message: "条形码格式不符合 GTIN 规范（校验位错误）",
  },
  {
    rule: "NO_IDENTIFIER",
    check: (p) => !p.barcode && !p.sku,
    message: "缺少 GTIN 和 MPN，建议至少填写一项",
  },
  {
    rule: "NO_BRAND",
    check: (p) => !p.vendor,
    message: "缺少品牌/vendor，GMC 要求有品牌",
  },
  {
    rule: "NO_GOOGLE_CATEGORY",
    check: (p) => !p.googleProductCategory,
    message:
      "未设置 Google 标准类目（google_product_category），建议填写以提升审核通过率和广告精准度",
  },
  {
    rule: "OVERSELL_POLICY",
    check: (p) => p.availableForSale === true && primaryInventoryPolicy(p) === "CONTINUE",
    message: "商品设置了超卖继续销售，GMC 中建议标记为 preorder 而非 in stock",
  },
  {
    rule: "HAS_COMPARE_AT_PRICE",
    check: (p) => {
      const compareAt = primaryCompareAtPrice(p);
      return Boolean(compareAt) && parseFloat(compareAt as string) > priceNumber(p);
    },
    message: "商品有划线价，已映射 salePrice 以在 GMC 展示促销角标",
  },
  {
    rule: "MULTI_VARIANT",
    check: (p) => p.variantCount > 1,
    message: "多变体商品将按变体逐条推送，并通过 itemGroupId 聚合展示",
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
