import { describe, expect, it } from "vitest";
import { polishFinalReply } from "../../../../../app/server/ai/utils/polishFinalReply";

describe("polishFinalReply", () => {
  it("空字符串", () => {
    expect(polishFinalReply("  \n  ")).toBe("");
  });

  it("含代码围栏时不做表格与列表润色", () => {
    const src = "```ts\nconst x = 1;\n```";
    expect(polishFinalReply(src)).toBe(src);
  });

  it("已有列表前缀时仅做表格规范化", () => {
    const src = "- 第一项\n- 第二项";
    expect(polishFinalReply(src)).toBe(src);
  });

  it("已有 Markdown 标题时保留结构", () => {
    const src = "## 标题\n\n正文";
    expect(polishFinalReply(src)).toBe("## 标题\n\n正文");
  });

  it("将表格转为列表后不再套 ###（由 normalize 分支返回）", () => {
    const src = ["| 指标 | 值 |", "| --- | --- |", "| A | 1 |"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("- **A**：值：1");
    expect(out).not.toContain("###");
  });

  it("多行「指标：值」润色为小节与粗体列表", () => {
    const src = ["销售额：100", "订单数：20"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("### 查询结果");
    expect(out).toContain("- **销售额**：100");
    expect(out).toContain("- **订单数**：20");
  });

  it("首行为标题、后续为指标", () => {
    const src = ["店铺概览", "销售额：100", "订单数：20"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("### 店铺概览");
    expect(out).toContain("- **销售额**：100");
  });

  it("「注：」行转为引用块", () => {
    const src = ["销售额：100", "订单数：20", "注：数据截止昨日"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("> 注：数据截止昨日");
  });

  it("单行非指标原文返回（length<=1 分支）", () => {
    expect(polishFinalReply("只有一行")).toBe("只有一行");
  });

  it("指标不足两行时用换行拼接", () => {
    const src = ["销售额：100", "说明文字无冒号指标"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toBe("销售额：100\n\n说明文字无冒号指标");
    expect(out).not.toContain("###");
  });

  it("统一 CRLF 为 LF", () => {
    const src = "销售额：100\r\n订单数：20";
    const out = polishFinalReply(src);
    expect(out.includes("\r")).toBe(false);
    expect(out).toContain("### 查询结果");
  });

  it("建议段普通段落收成 1. 2. 3.", () => {
    const src = [
      "近 30 天 0 订单，问题不在转化。",
      "",
      "建议",
      "",
      "先把有货商品上架，否则后面优化没有落点。",
      "",
      "再补搜索标题和描述，SEO 缺的最多。",
      "",
      "库存健康放到后面做。",
      "",
      "你想从哪一步开始？",
    ].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("### 建议");
    expect(out).toContain("1. 先把有货商品上架");
    expect(out).toContain("2. 再补搜索标题和描述");
    expect(out).toContain("3. 库存健康放到后面做");
    expect(out).toContain("你想从哪一步开始？");
  });

  it("建议段已有编号时不重复加", () => {
    const src = ["建议", "", "1. 先上架", "", "2. 再补 SEO"].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("1. 先上架");
    expect(out).toContain("2. 再补 SEO");
    expect(out).not.toMatch(/1\. 1\./);
  });

  it("建议段 **小标题：** 块收成编号", () => {
    const src = [
      "近 30 天 0 订单。",
      "",
      "建议",
      "",
      "**先清目录，再谈优化：**",
      "先归档测试商品。",
      "",
      "**用表格批量补 SEO 标题和描述：**",
      "208 个商品缺搜索标题。",
      "",
      "**最后攻正文与商品页本身：**",
      "挑 3-5 个主推做质量评分。",
      "",
      "你想从哪一步开始？",
    ].join("\n");
    const out = polishFinalReply(src);
    expect(out).toContain("1. **先清目录，再谈优化：**");
    expect(out).toContain("2. **用表格批量补 SEO 标题和描述：**");
    expect(out).toContain("3. **最后攻正文与商品页本身：**");
    expect(out).toMatch(/1\. \*\*先清目录，再谈优化：\*\* 先归档测试商品/);
  });

  it.each(["建议", "### 建议", "**建议**", "### **建议**", "建议：", "**建议：**", "### 建议：", "建议（按优先级）"])(
    "「%s」都能当建议小标题识别并编号",
    (heading) => {
      const src = [
        "近 30 天 0 订单。",
        "",
        heading,
        "",
        "**先把有货商品放出来：** 把草稿商品改成 Active。",
        "",
        "**再补搜索标题与描述：** 208 个商品走的是默认回落。",
        "",
        "你想从哪一步开始？",
      ].join("\n");
      const out = polishFinalReply(src);
      expect(out).toContain("### 建议");
      expect(out).toContain("1. **先把有货商品放出来：**");
      expect(out).toContain("2. **再补搜索标题与描述：**");
    },
  );

  it("正文里以「建议」开头的整句不当小标题", () => {
    const src = ["销售额：100", "订单数：20", "建议优先补齐搜索标题"].join("\n");
    const out = polishFinalReply(src);
    expect(out).not.toContain("### 建议");
  });
});
