import { describe, expect, it } from "vitest";
import { buildSeoAuditSuggestedNextActions } from "../../../../../../app/server/ai/skills/seoAudit/runSeoAudit.tool";
import type { SeoAuditIssue } from "../../../../../../app/lib/seoAudit";

function issue(
  partial: Pick<SeoAuditIssue, "code" | "fixability" | "samples"> &
    Partial<SeoAuditIssue>,
): SeoAuditIssue {
  return {
    severity: "high",
    affectedCount: partial.samples.length,
    ...partial,
  };
}

describe("buildSeoAuditSuggestedNextActions", () => {
  it("opens copy card for thin content and field-edit card for missing SEO", () => {
    const actions = buildSeoAuditSuggestedNextActions([
      issue({
        code: "description_missing",
        fixability: "bulk_seo",
        samples: [
          {
            productId: "gid://shopify/Product/1",
            productTitle: "A",
            handle: "a",
            currentValue: null,
          },
        ],
      }),
      issue({
        code: "body_too_thin",
        fixability: "product_content",
        samples: [
          {
            productId: "gid://shopify/Product/2",
            productTitle: "B",
            handle: "b",
            currentValue: "short",
          },
        ],
      }),
      issue({
        code: "handle_non_descriptive",
        fixability: "manual",
        samples: [
          {
            productId: "gid://shopify/Product/3",
            productTitle: "C",
            handle: "x",
            currentValue: "x",
          },
        ],
      }),
    ]);

    expect(actions).toHaveLength(2);
    expect(actions[0]?.tool).toBe("open_product_improve_form");
    expect(actions[0]?.products).toEqual([
      { id: "gid://shopify/Product/2", title: "B" },
    ]);
    expect(actions[1]?.tool).toBe("open_bulk_product_field_edit_form");
    expect(actions[1]?.field).toBe("seoDescription");
    expect(actions[1]?.products).toEqual([
      { id: "gid://shopify/Product/1", title: "A" },
    ]);
  });

  it("opens a title field card for missing SEO titles", () => {
    const actions = buildSeoAuditSuggestedNextActions([
      issue({
        code: "title_missing",
        fixability: "bulk_seo",
        samples: [
          {
            productId: "gid://shopify/Product/9",
            productTitle: "T",
            handle: "t",
            currentValue: null,
          },
        ],
      }),
    ]);
    expect(actions).toEqual([
      expect.objectContaining({
        tool: "open_bulk_product_field_edit_form",
        field: "seoTitle",
        products: [{ id: "gid://shopify/Product/9", title: "T" }],
      }),
    ]);
  });
});
