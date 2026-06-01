import { describe, expect, it } from "vitest";
import { analyzeTranslations, type ReportEntry } from "../../worker/src/services/translationReport.js";

function entry(p: Partial<ReportEntry> & Pick<ReportEntry, "key" | "original" | "translated">): ReportEntry {
  return { module: "PRODUCT", resourceId: "gid://shopify/Product/1", status: "translated", ...p };
}

function reasons(entries: ReportEntry[]) {
  return analyzeTranslations(entries).flags.map((f) => `${f.key}:${f.reason}`);
}

describe("analyzeTranslations", () => {
  it("flags unchanged plain fields but not skip fields", () => {
    const r = reasons([
      entry({ key: "title", original: "你好世界", translated: "你好世界" }),
      entry({ key: "handle", original: "my-handle", translated: "my-handle" }),
    ]);
    expect(r).toContain("title:unchanged");
    expect(r).not.toContain("handle:unchanged");
  });

  it("flags fallback status", () => {
    expect(reasons([entry({ key: "title", original: "你好", translated: "你好", status: "fallback" })])).toContain(
      "title:fallback",
    );
  });

  it("flags empty translations", () => {
    expect(reasons([entry({ key: "title", original: "你好", translated: "" })])).toContain("title:empty");
  });

  it("flags html tag count mismatch", () => {
    const r = reasons([entry({ key: "body_html", original: "<p>Hi</p>", translated: "Bonjour" })]);
    expect(r).toContain("body_html:html-tag-mismatch");
  });

  it("flags placeholder loss", () => {
    const r = reasons([entry({ key: "title", original: "Hi {{name}}", translated: "Bonjour" })]);
    expect(r).toContain("title:placeholder-loss");
  });

  it("flags extreme length ratio for long plain fields", () => {
    const r = reasons([
      entry({ key: "body", original: "x".repeat(100), translated: "y" }),
    ]);
    expect(r).toContain("body:length-ratio");
  });

  it("builds a field inventory with counts and averages", () => {
    const report = analyzeTranslations([
      entry({ key: "title", original: "abcd", translated: "wxyz", resourceId: "p1" }),
      entry({ key: "title", original: "ab", translated: "wx", resourceId: "p2" }),
      entry({ key: "handle", original: "a-b", translated: "a-b", resourceId: "p1" }),
    ]);
    expect(report.totals.resources).toBe(2);
    expect(report.totals.fields).toBe(3);
    const title = report.modules.PRODUCT.keys.title;
    expect(title.count).toBe(2);
    expect(title.klass).toBe("plain");
    expect(title.avgOriginalLen).toBe(3); // (4+2)/2
    expect(report.modules.PRODUCT.keys.handle.klass).toBe("skip");
    expect(report.modules.PRODUCT.resources).toBe(2);
  });

  it("samples up to N entries per class", () => {
    const many: ReportEntry[] = Array.from({ length: 10 }, (_, i) =>
      entry({ key: "title", original: `o${i}`, translated: `t${i}`, resourceId: `p${i}` }),
    );
    const report = analyzeTranslations(many, 3);
    expect(report.samples.length).toBe(3); // all plain → capped at 3
  });
});
