import { describe, expect, it } from "vitest";
import {
  applyInstallUrl,
  escapeHtml,
  extractTemplateKeys,
  renderPlaceholders,
} from "../../../../../admin/server/lib/opsEmail/renderTemplate.js";
import { OPS_EMAIL_CTA_HREF } from "../../../../../admin/server/lib/opsEmail/templateCatalog.js";

describe("opsEmail renderTemplate", () => {
  it("extracts placeholder keys", () => {
    expect(extractTemplateKeys("Hi {{recipientName}}, {{appName}}")).toEqual([
      "recipientName",
      "appName",
    ]);
  });

  it("escapes substituted values", () => {
    const html = renderPlaceholders("<p>{{shopName}}</p>", {
      shopName: `<img src=x onerror=alert(1)>`,
    });
    expect(html).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  });

  it("rewrites CTA to installUrl placeholder", () => {
    const source = `<a href="${OPS_EMAIL_CTA_HREF}">open</a>`;
    const rewritten = applyInstallUrl(source, "https://apps.shopify.com/spark");
    expect(rewritten).toContain("{{installUrl}}");
    expect(renderPlaceholders(rewritten, { installUrl: "https://apps.shopify.com/spark" })).toBe(
      `<a href="https://apps.shopify.com/spark">open</a>`,
    );
  });

  it("keeps CTA when installUrl is empty", () => {
    const source = `<a href="${OPS_EMAIL_CTA_HREF}">open</a>`;
    expect(applyInstallUrl(source, "")).toBe(source);
  });

  it("escapes quotes in attributes", () => {
    expect(escapeHtml(`https://x.com/?q="a"`)).toBe("https://x.com/?q=&quot;a&quot;");
  });
});
