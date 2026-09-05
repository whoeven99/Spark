import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  decodeSheetBuffer,
  parseSheetBuffer,
  SheetParseError,
} from "../../../../app/server/sheetImport/parseSheet.server";

const OPTIONS = { maxRows: 1000 };

function csv(text: string): Buffer {
  return Buffer.from(text, "utf-8");
}

function xlsxBuffer(matrix: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("decodeSheetBuffer", () => {
  it("剥掉 UTF-8 BOM", () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("SKU,售价")]);
    expect(decodeSheetBuffer(buffer)).toBe("SKU,售价");
  });

  it("普通 UTF-8 原样解码", () => {
    expect(decodeSheetBuffer(Buffer.from("SKU,售价\nACM-01,179"))).toBe("SKU,售价\nACM-01,179");
  });

  it("纯 ASCII 不受影响", () => {
    expect(decodeSheetBuffer(Buffer.from("sku,price"))).toBe("sku,price");
  });
});

describe("parseSheetBuffer — CSV", () => {
  it("第一行当表头，其余当数据", () => {
    const sheet = parseSheetBuffer(csv("SKU,售价\nACM-01,179\nACM-02,89"), "a.csv", OPTIONS);
    expect(sheet.headers).toEqual(["SKU", "售价"]);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].cells).toEqual({ SKU: "ACM-01", 售价: "179" });
  });

  it("行号从 1 开始且与原文件对齐（表头是第 1 行）", () => {
    const sheet = parseSheetBuffer(csv("SKU,售价\nACM-01,179"), "a.csv", OPTIONS);
    expect(sheet.rows[0].sourceRow).toBe(2);
  });

  it("跳过整行为空的行", () => {
    const sheet = parseSheetBuffer(csv("SKU,售价\nACM-01,179\n\nACM-02,89"), "a.csv", OPTIONS);
    expect(sheet.rows).toHaveLength(2);
  });

  it("重复表头加序号后缀，避免互相覆盖", () => {
    const sheet = parseSheetBuffer(csv("SKU,售价,售价\nACM-01,179,189"), "a.csv", OPTIONS);
    expect(sheet.headers).toEqual(["SKU", "售价", "售价 (2)"]);
    expect(sheet.rows[0].cells["售价"]).toBe("179");
    expect(sheet.rows[0].cells["售价 (2)"]).toBe("189");
  });

  it("空表头单元格给出占位列名", () => {
    const sheet = parseSheetBuffer(csv("SKU,,售价\nACM-01,x,179"), "a.csv", OPTIONS);
    expect(sheet.headers[1]).toBe("列2");
  });

  it("撞到 maxRows 时截断并置 truncated", () => {
    const body = Array.from({ length: 5 }, (_, i) => `ACM-0${i},1${i}`).join("\n");
    const sheet = parseSheetBuffer(csv(`SKU,售价\n${body}`), "a.csv", { maxRows: 3 });
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.truncated).toBe(true);
  });

  it("含逗号的值被引号包裹时正确解析", () => {
    const sheet = parseSheetBuffer(csv('SKU,标题\nACM-01,"耳机, 白色"'), "a.csv", OPTIONS);
    expect(sheet.rows[0].cells["标题"]).toBe("耳机, 白色");
  });

  it("空文件报 SheetParseError", () => {
    expect(() => parseSheetBuffer(csv(""), "a.csv", OPTIONS)).toThrow(SheetParseError);
  });
});

describe("parseSheetBuffer — Excel", () => {
  it("解析第一个 sheet", () => {
    const buffer = xlsxBuffer([
      ["SKU", "售价"],
      ["ACM-01", 179],
      ["ACM-02", 89.5],
    ]);
    const sheet = parseSheetBuffer(buffer, "a.xlsx", OPTIONS);
    expect(sheet.headers).toEqual(["SKU", "售价"]);
    expect(sheet.rows[0].cells).toEqual({ SKU: "ACM-01", 售价: "179" });
    expect(sheet.rows[1].cells["售价"]).toBe("89.5");
  });

  it("收敛 Excel 浮点噪声", () => {
    const sheet = parseSheetBuffer(
      xlsxBuffer([
        ["SKU", "售价"],
        ["ACM-01", 178.99999999999997],
      ]),
      "a.xlsx",
      OPTIONS,
    );
    expect(sheet.rows[0].cells["售价"]).toBe("179");
  });
});

describe("parseSheetBuffer — 不支持的类型", () => {
  it("非表格扩展名报错", () => {
    expect(() => parseSheetBuffer(csv("x"), "a.pdf", OPTIONS)).toThrow(SheetParseError);
  });
});
