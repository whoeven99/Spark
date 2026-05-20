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
});
