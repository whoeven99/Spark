import { describe, expect, it } from "vitest";
import {
  escapeHtmlForDescriptionText,
  plainDescriptionTextToDescriptionHtml,
} from "../../../../app/server/generateDescription/plainDescriptionTextToHtml.server";

describe("escapeHtmlForDescriptionText", () => {
  it("转义常见 HTML 特殊字符", () => {
    expect(escapeHtmlForDescriptionText(`<&>"'`)).toBe(
      "&lt;&amp;&gt;&quot;&#39;",
    );
  });
});

describe("plainDescriptionTextToDescriptionHtml", () => {
  it("空或仅空白返回空字符串", () => {
    expect(plainDescriptionTextToDescriptionHtml("")).toBe("");
    expect(plainDescriptionTextToDescriptionHtml("  \n\t ")).toBe("");
  });

  it("单段换行转为 br", () => {
    expect(plainDescriptionTextToDescriptionHtml("a\nb")).toBe(
      "<p>a<br />b</p>",
    );
  });

  it("空行分段为多个 p", () => {
    expect(plainDescriptionTextToDescriptionHtml("a\n\nb")).toBe(
      "<p>a</p><p>b</p>",
    );
  });

  it("段内内容被转义", () => {
    expect(plainDescriptionTextToDescriptionHtml("x<y>")).toBe(
      "<p>x&lt;y&gt;</p>",
    );
  });
});
