import { describe, expect, it } from "vitest";

// 通过模块内联测试解析逻辑：导出测试辅助需重构；此处用动态 import 仅测可导入性
describe("volcengineImageGenerate", () => {
  it("exports volcengineGenerateImageToBytes", async () => {
    const mod = await import(
      "../../../../app/server/imageGeneration/volcengineImageGenerate.server"
    );
    expect(typeof mod.volcengineGenerateImageToBytes).toBe("function");
  });
});
