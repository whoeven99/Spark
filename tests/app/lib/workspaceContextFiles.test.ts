import { describe, expect, it } from "vitest";
import {
  parseWorkspaceFilesFromText,
  withWorkspaceFileFallback,
} from "../../../app/lib/workspaceContextFiles";

describe("parseWorkspaceFilesFromText", () => {
  it("reads file IDs from workspace context lines", () => {
    const files = parseWorkspaceFilesFromText(
      "[工作台上下文]\n- 已选文件（共 1 个）：\n    • 价目表.xlsx（数据表），已解析 2k 字符 [文件ID: fileabc]\n",
    );
    expect(files).toEqual([{ id: "fileabc", name: "价目表.xlsx" }]);
  });

  it("reads file IDs from attached file context blocks", () => {
    const files = parseWorkspaceFilesFromText(
      "【附加文件上下文】\n\n=== 文件：costs.csv ===\n文件 ID：costid1\nsku,cost\nA,1\n",
    );
    expect(files).toEqual([{ id: "costid1", name: "costs.csv" }]);
  });

  it("ignores in-flight local file ids", () => {
    expect(
      parseWorkspaceFilesFromText("    • pending.csv [文件ID: file-171000]\n"),
    ).toEqual([]);
  });
});

describe("withWorkspaceFileFallback", () => {
  it("fills empty fileId from workspace context", () => {
    const payload: { fileId?: string; fileName?: string; skuColumn?: string } = {
      skuColumn: "SKU",
    };
    expect(withWorkspaceFileFallback(payload, "    • prices.csv [文件ID: abc123]\n")).toEqual({
      skuColumn: "SKU",
      fileId: "abc123",
      fileName: "prices.csv",
    });
  });

  it("does not overwrite an existing fileId", () => {
    expect(
      withWorkspaceFileFallback(
        { fileId: "keep", fileName: "a.csv" },
        "    • prices.csv [文件ID: abc123]\n",
      ),
    ).toEqual({ fileId: "keep", fileName: "a.csv" });
  });
});
