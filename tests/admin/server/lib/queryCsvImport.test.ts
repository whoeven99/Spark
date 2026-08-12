import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "../../../../admin/server/lib/queryCsvImport.js";

describe("parseCsvText", () => {
  it("parses single-line rows", () => {
    const csv = [
      "resourceId,target_code,key,target_text,digest",
      "gid://shopify/Product/1,zh-CN,title,你好,abc123",
    ].join("\n");

    expect(parseCsvText(csv)).toEqual([
      {
        resourceId: "gid://shopify/Product/1",
        target_code: "zh-CN",
        key: "title",
        target_text: "你好",
        digest: "abc123",
      },
    ]);
  });

  it("keeps newlines inside quoted fields as one row", () => {
    const csv = [
      "resourceId,target_code,key,target_text,digest",
      'gid://shopify/Product/1,zh-CN,body_html,"line1',
      'line2",abc123',
    ].join("\n");

    expect(parseCsvText(csv)).toEqual([
      {
        resourceId: "gid://shopify/Product/1",
        target_code: "zh-CN",
        key: "body_html",
        target_text: "line1\nline2",
        digest: "abc123",
      },
    ]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    const csv = [
      "resourceId,target_code,key,target_text,digest",
      'gid://shopify/Product/1,zh-CN,body_html,"say ""hi""",abc123',
    ].join("\n");

    expect(parseCsvText(csv)[0]?.target_text).toBe('say "hi"');
  });

  it("parses the multiline HTML export without splitting rows", () => {
    const file = path.resolve(
      process.cwd(),
      "test - Untitled spreadsheet - 错误数据 - 工作表1.csv",
    );
    const rows = parseCsvText(readFileSync(file, "utf8"));

    expect(rows.length).toBe(445);
    expect(rows[0]).toMatchObject({
      resourceId: "gid://shopify/Product/10371491529009",
      target_code: "zh-CN",
      key: "body_html",
      digest: "7497defbcc07277e6be587df7e55022af8a639aab923cab73023abf564c20cbc",
    });
    expect(rows[0]?.target_text?.length).toBeGreaterThan(100);
  });
});
