import { describe, expect, it } from "vitest";
import {
  isNonDescriptiveHandle,
  runSeoAudit,
  SEO_AUDIT_GUIDANCE,
  SEO_AUDIT_ISSUE_CODES,
  SEO_AUDIT_SAMPLES_PER_ISSUE,
  seoDisplayWidth,
  type SeoAuditIssueCode,
  type SeoAuditProductInput,
} from "../../../app/lib/seoAudit";

/** 够长的正文，避免测别的规则时被 body_too_thin 干扰。 */
const LONG_BODY = "这是一段足够长的商品正文描述".repeat(20);

function product(overrides: Partial<SeoAuditProductInput> = {}): SeoAuditProductInput {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "Waterproof Hiking Backpack",
    handle: "waterproof-hiking-backpack",
    publishedAt: "2026-01-01T00:00:00Z",
    descriptionText: LONG_BODY,
    seoTitle: "Waterproof Hiking Backpack 45L for Trail and Commute",
    seoDescription:
      "A waterproof 45L hiking backpack that fits a 17 inch laptop. Built for trails and daily commutes, backed by a 30 day return policy.",
    ...overrides,
  };
}

function codesOf(result: ReturnType<typeof runSeoAudit>): SeoAuditIssueCode[] {
  return result.issues.map((issue) => issue.code);
}

function issue(result: ReturnType<typeof runSeoAudit>, code: SeoAuditIssueCode) {
  return result.issues.find((item) => item.code === code);
}

describe("seoDisplayWidth", () => {
  it("counts ASCII as one and CJK as two", () => {
    expect(seoDisplayWidth("abc")).toBe(3);
    expect(seoDisplayWidth("防水背包")).toBe(8);
    expect(seoDisplayWidth("45L 防水背包")).toBe(12);
  });

  it("handles full-width punctuation and empty input", () => {
    expect(seoDisplayWidth("")).toBe(0);
    expect(seoDisplayWidth("，")).toBe(2);
  });

  it("does not split surrogate pairs into double counts", () => {
    // 用 for...of 遍历码点，emoji 只算一次（按半角计 1）
    expect(seoDisplayWidth("a😀")).toBe(2);
  });
});

describe("isNonDescriptiveHandle", () => {
  it("accepts a normal descriptive slug", () => {
    expect(isNonDescriptiveHandle("waterproof-hiking-backpack-45l")).toBe(false);
  });

  it.each([
    ["", "empty"],
    ["copy-of-my-product", "copy prefix"],
    ["my-product-copy", "copy suffix"],
    ["my-product-copy-2", "numbered copy suffix"],
    ["untitled-product", "untitled"],
    ["backpack-1a2b3c4d", "random hex suffix"],
    ["123456", "all numeric"],
    ["%e9%98%b2%e6%b0%b4", "percent encoded"],
  ])("flags %s (%s)", (handle) => {
    expect(isNonDescriptiveHandle(handle)).toBe(true);
  });

  it("flags handles longer than the URL display limit", () => {
    expect(isNonDescriptiveHandle("a".repeat(76))).toBe(true);
    expect(isNonDescriptiveHandle("a".repeat(70))).toBe(false);
  });
});

describe("runSeoAudit", () => {
  it("reports a clean store with no issues and full coverage", () => {
    const result = runSeoAudit([product()]);
    expect(result.issues).toEqual([]);
    expect(result.summary.titleCoverage).toBe(100);
    expect(result.summary.descriptionCoverage).toBe(100);
    expect(result.summary.productsWithIssues).toBe(0);
  });

  it("excludes unpublished products from the audit but still reports them", () => {
    const result = runSeoAudit([
      product(),
      product({ productId: "gid://shopify/Product/2", publishedAt: null, seoTitle: null }),
    ]);
    expect(result.summary.scannedProducts).toBe(2);
    expect(result.summary.auditedProducts).toBe(1);
    expect(result.summary.unpublishedProducts).toBe(1);
    // 未上架商品的缺失 SEO 不应该被报出来
    expect(codesOf(result)).not.toContain("title_missing");
  });

  it("flags missing seo title and description", () => {
    const result = runSeoAudit([product({ seoTitle: null, seoDescription: null })]);
    expect(codesOf(result)).toEqual(
      expect.arrayContaining(["title_missing", "description_missing"]),
    );
    expect(result.summary.titleCoverage).toBe(0);
    expect(result.summary.descriptionCoverage).toBe(0);
  });

  it("uses display width, so a Chinese title hits the limit at half the character count", () => {
    // 31 个汉字 = 62 半角当量 > 60，字符数只有 31 却已超长
    const chineseTitle = "防".repeat(31);
    const result = runSeoAudit([product({ seoTitle: chineseTitle })]);
    const tooLong = issue(result, "title_too_long");
    expect(tooLong?.affectedCount).toBe(1);
    expect(tooLong?.samples[0]?.currentWidth).toBe(62);
  });

  it("flags short titles and descriptions separately from long ones", () => {
    const result = runSeoAudit([product({ seoTitle: "Backpack", seoDescription: "Nice bag." })]);
    expect(codesOf(result)).toEqual(
      expect.arrayContaining(["title_too_short", "description_too_short"]),
    );
    expect(codesOf(result)).not.toContain("title_too_long");
  });

  it("detects duplicate titles across products and counts the groups", () => {
    const result = runSeoAudit([
      product({ productId: "gid://shopify/Product/1", seoTitle: "Wireless Bluetooth Headphones" }),
      product({ productId: "gid://shopify/Product/2", seoTitle: "wireless bluetooth headphones " }),
      product({ productId: "gid://shopify/Product/3", seoTitle: "A Genuinely Different Title" }),
    ]);
    const duplicated = issue(result, "title_duplicated");
    expect(duplicated?.affectedCount).toBe(2);
    expect(duplicated?.metrics?.duplicateGroups).toBe(1);
    expect(duplicated?.severity).toBe("high");
  });

  it("falls back to the product title when checking duplicate titles", () => {
    // 两个商品都没填 SEO 标题、商品名相同 → 渲染出来的标题会撞车
    const result = runSeoAudit([
      product({ productId: "gid://shopify/Product/1", seoTitle: null, productTitle: "Same Name" }),
      product({ productId: "gid://shopify/Product/2", seoTitle: null, productTitle: "Same Name" }),
    ]);
    expect(issue(result, "title_duplicated")?.affectedCount).toBe(2);
  });

  it("does not report duplicate descriptions for products that simply left it blank", () => {
    const result = runSeoAudit([
      product({ productId: "gid://shopify/Product/1", seoDescription: null }),
      product({ productId: "gid://shopify/Product/2", seoDescription: null }),
    ]);
    expect(codesOf(result)).not.toContain("description_duplicated");
    expect(issue(result, "description_missing")?.affectedCount).toBe(2);
  });

  it("flags thin product bodies", () => {
    const result = runSeoAudit([product({ descriptionText: "Good product." })]);
    const thin = issue(result, "body_too_thin");
    expect(thin?.affectedCount).toBe(1);
    expect(thin?.fixability).toBe("product_content");
  });

  it("marks handle problems as not batch-fixable", () => {
    const result = runSeoAudit([product({ handle: "copy-of-untitled-product" })]);
    expect(issue(result, "handle_non_descriptive")?.fixability).toBe("manual");
  });

  it("sorts issues by severity then by affected count", () => {
    const result = runSeoAudit([
      product({ productId: "gid://shopify/Product/1", seoTitle: "Dup", seoDescription: null }),
      product({ productId: "gid://shopify/Product/2", seoTitle: "Dup", seoDescription: null }),
      product({ productId: "gid://shopify/Product/3", seoDescription: null }),
    ]);
    const severities = result.issues.map((item) => item.severity);
    const firstLow = severities.indexOf("low");
    const lastHigh = severities.lastIndexOf("high");
    expect(severities[0]).toBe("high");
    if (firstLow !== -1) expect(lastHigh).toBeLessThan(firstLow);
  });

  it("caps samples per issue but keeps the true affected count", () => {
    const products = Array.from({ length: 12 }, (_, index) =>
      product({ productId: `gid://shopify/Product/${index}`, seoDescription: null }),
    );
    const missing = issue(runSeoAudit(products), "description_missing");
    expect(missing?.affectedCount).toBe(12);
    expect(missing?.samples).toHaveLength(SEO_AUDIT_SAMPLES_PER_ISSUE);
  });

  it("passes the truncated flag through and survives an empty store", () => {
    const empty = runSeoAudit([], { truncated: true });
    expect(empty.summary.truncated).toBe(true);
    expect(empty.summary.titleCoverage).toBe(0);
    expect(empty.issues).toEqual([]);
  });
});

describe("SEO_AUDIT_GUIDANCE", () => {
  it("covers every issue code with non-empty knowledge", () => {
    for (const code of SEO_AUDIT_ISSUE_CODES) {
      const guidance = SEO_AUDIT_GUIDANCE[code];
      expect(guidance, code).toBeDefined();
      expect(guidance.title.length, code).toBeGreaterThan(0);
      expect(guidance.why.length, code).toBeGreaterThan(0);
      expect(guidance.howTo.length, code).toBeGreaterThan(0);
      expect(guidance.example.length, code).toBeGreaterThan(0);
    }
  });
});
