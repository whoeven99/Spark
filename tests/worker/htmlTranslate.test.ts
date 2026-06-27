import { describe, expect, it } from "vitest";
import { maskPlaceholders } from "../../worker/src/services/placeholderMask.js";
import { roundtripHtmlForTest } from "../../worker/src/services/htmlTranslate.js";

describe("htmlTranslate — multi-paragraph page description", () => {
  it("extracts each paragraph and list item as separate translation units", async () => {
    const { htmlNodePartsOf } = await import("../../worker/src/services/htmlTranslate.js");
    const html =
      "<p>Usamos cookies para que o site funcione corretamente. " +
      '<a href="/policies/privacy">política de privacidade</a>. test for translation.</p>' +
      "<p>lol, Realizzata in 100% cotone organico ring-spun per una sensazione morbida.</p>" +
      "<ul><li>98.99% cotone organico ring-spun</li>" +
      "<li>Jersey semplice</li><li>Vestibilità media</li></ul>";
    const { nodeParts } = htmlNodePartsOf(html);
    const flat = nodeParts.flat();
    expect(flat.length).toBeGreaterThanOrEqual(5);
    expect(flat.some((t) => t.includes("Usamos cookies"))).toBe(true);
    expect(flat.some((t) => t.includes("Realizzata"))).toBe(true);
    expect(flat.some((t) => t.includes("Jersey semplice"))).toBe(true);
  });

  it("roundtrips all paragraphs when every leaf is translated", () => {
    const html =
      "<p>Usamos cookies para que o site funcione.</p>" +
      "<p>Realizzata in 100% cotone organico.</p>" +
      "<ul><li>Jersey semplice</li><li>Vestibilità media</li></ul>";
    const out = roundtripHtmlForTest(html, (text) => {
      if (text.includes("Usamos")) return "クッキーを使用しています。";
      if (text.includes("Realizzata")) return "100%オーガニックコットンで作られています。";
      if (text === "Jersey semplice") return "シンプルなジャージー";
      if (text === "Vestibilità media") return "標準フィット";
      return text;
    });
    expect(out).toContain("クッキーを使用しています");
    expect(out).toContain("100%オーガニックコットン");
    expect(out).toContain("シンプルなジャージー");
    expect(out).toContain("標準フィット");
    expect(out).not.toContain("Realizzata");
    expect(out).not.toContain("Jersey semplice");
  });
});

describe("htmlTranslate — orphaned closing tags", () => {
  it("preserves literal </div> tags instead of extracting /div text nodes", () => {
    const html = "<p><strong>3. Taille</strong></p></div></div></div>";
    const out = roundtripHtmlForTest(html, (text) =>
      text.includes("Taille") ? "3. サイズ" : text,
    );
    // Parser drops orphaned closing tags (same as Jsoup parseBodyFragment).
    expect(out).toContain("3. サイズ");
    expect(out).not.toMatch(/>\s*\/div\s*</);
  });
});

describe("htmlTranslate — style blocks", () => {
  it("does not translate CSS inside closed style tags", () => {
    const css =
      "div::-webkit-scrollbar { height: 16px; background-color: #888; border-radius: 8px; }";
    const html = `<style><style>\n${css}\n</style>\n<p>Ships in 3 days</p>`;
    const out = roundtripHtmlForTest(html, (text) =>
      text === "Ships in 3 days" ? "3日以内に発送" : text,
    );
    expect(out).toContain("height: 16px");
    expect(out).toContain("background-color: #888");
    expect(out).not.toContain("高さ");
    expect(out).toContain("3日以内に発送");
  });

  it("skips CSS in style and translates following paragraph", () => {
    const html = "<style>\ndiv { height: 16px; background-color: #888; }\n</style><p>Hello</p>";
    const out = roundtripHtmlForTest(html, (text) => (text === "Hello" ? "こんにちは" : text));
    expect(out).toContain("height: 16px");
    expect(out).not.toContain("高さ");
    expect(out).toContain("こんにちは");
  });
});

describe("htmlTranslate — inline markup preservation", () => {
  it("preserves anchor href through roundtrip", () => {
    const html =
      '<p><a href="/collections/vertical-chess-boards">← Browse all vertical and hanging chess boards</a></p>';
    const out = roundtripHtmlForTest(html, (text) =>
      text.includes("Browse") ? "← すべての縦型および吊り下げ式チェスボードを見る" : text,
    );
    expect(out).toContain('href="/collections/vertical-chess-boards"');
    expect(out).toContain("<a ");
    expect(out).toContain("← すべての縦型および吊り下げ式チェスボードを見る");
  });

  it("preserves strong tags through roundtrip", () => {
    const html =
      "<ul><li><strong>Custom resin colours</strong> for light/dark pieces — choose your own.</li></ul>";
    const out = roundtripHtmlForTest(html, (text) => {
      if (text === "Custom resin colours") return "カスタムレジンカラー";
      if (text.includes("light/dark")) return "ライト/ダークピース用 — お好みで選択可能。";
      return text;
    });
    expect(out).toContain("<strong>");
    expect(out).toContain("</strong>");
    expect(out).toContain("カスタムレジンカラー");
    expect(out).toContain("ライト/ダーク");
    expect(out).not.toMatch(/\/dark\s/);
  });
});

describe("placeholderMask — path false positives", () => {
  it("does not mask /dark inside light/dark", () => {
    const { masked, tokens } = maskPlaceholders("for light/dark pieces");
    expect(masked).toBe("for light/dark pieces");
    expect(tokens).toHaveLength(0);
  });
});

describe("isTranslatableHtmlContent — script/style embeds", () => {
  it("excludes script-only Loox-style embed snippets", async () => {
    const { isTranslatableHtmlContent } = await import("../../worker/src/services/htmlTranslate.js");
    const loox =
      "<script>var loox_global_hash = '1768489821736';</script>" +
      '<script>var visitor_level_referral = {"active":true,"button_text":"获得€10"};</script>' +
      "<style>.loox-reviews-default { max-width: 1200px; }</style>";
    expect(isTranslatableHtmlContent(loox)).toBe(false);
  });

  it("includes HTML with visible copy alongside script blocks", async () => {
    const { isTranslatableHtmlContent } = await import("../../worker/src/services/htmlTranslate.js");
    const html = "<p>Ships in 3 days</p><script>track('x');</script>";
    expect(isTranslatableHtmlContent(html)).toBe(true);
  });
});

describe("translationRuleJudgment — script embeds", () => {
  it("returns false for script-only metafield value", async () => {
    const { translationRuleJudgment } = await import(
      "../../worker/src/services/translationFilter/judgeTranslateUtils.js"
    );
    const loox = "<script>var x = 1;</script><style>.a{}</style>";
    expect(translationRuleJudgment("value", loox)).toBe(false);
  });
});
