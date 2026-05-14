import { describe, expect, it } from "vitest";
import {
  isMarkdownTableSeparator,
  normalizeMarkdownTables,
  splitTableRow,
} from "./markdownTableNormalize";

describe("splitTableRow", () => {
  it("去除首尾竖线并按列拆分", () => {
    expect(splitTableRow("| A | B |")).toEqual(["A", "B"]);
  });
});

describe("isMarkdownTableSeparator", () => {
  it("识别标准分隔行", () => {
    expect(isMarkdownTableSeparator("| --- | --- |")).toBe(true);
    expect(isMarkdownTableSeparator("|:---|:---:|")).toBe(true);
  });

  it("非分隔行返回 false", () => {
    expect(isMarkdownTableSeparator("| a | b |")).toBe(false);
    expect(isMarkdownTableSeparator("")).toBe(false);
    expect(isMarkdownTableSeparator("普通文本")).toBe(false);
  });
});

describe("normalizeMarkdownTables", () => {
  it("无表格时原文不变", () => {
    const src = "第一段\n\n第二段";
    expect(normalizeMarkdownTables(src)).toBe(src);
  });

  it("将简单表格转为列表", () => {
    const src = [
      "| 渠道 | 销售额 |",
      "| --- | --- |",
      "| 搜索 | 100 |",
      "| 社交 | 200 |",
    ].join("\n");
    const out = normalizeMarkdownTables(src);
    expect(out).toContain("- **搜索**：销售额：100");
    expect(out).toContain("- **社交**：销售额：200");
  });

  it("表体为空时保留表头与分隔行", () => {
    const src = "| H1 | H2 |\n| --- | --- |";
    expect(normalizeMarkdownTables(src)).toBe(src);
  });

  it("两段文字夹表格互不影响", () => {
    const src = [
      "前言",
      "",
      "| K | V |",
      "| --- | --- |",
      "| a | 1 |",
      "",
      "后记",
    ].join("\n");
    const out = normalizeMarkdownTables(src);
    expect(out).toContain("前言");
    expect(out).toContain("- **a**：V：1");
    expect(out).toContain("后记");
  });
});
