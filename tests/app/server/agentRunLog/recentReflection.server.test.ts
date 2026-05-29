import { describe, expect, it } from "vitest";
import {
  buildReflectionFromRun,
} from "../../../../app/server/agentRunLog/recentReflection.server";

describe("buildReflectionFromRun", () => {
  it("marks error runs as failed reflection", () => {
    const reflection = buildReflectionFromRun({
      status: "error",
      errorMessage: "tool failed",
      toolNames: ["shopifyInfo"],
      inputText: "帮我查店铺数据",
    });

    expect(reflection.summary).toContain("未成功完成");
    expect(reflection.rootCause).toContain("tool failed");
    expect(reflection.generatedAt).toBeTruthy();
  });

  it("adds strategy hints when no tool was used", () => {
    const reflection = buildReflectionFromRun({
      status: "success",
      toolNames: [],
      replyText: "ok",
      inputText: "最近 7 天销售额怎么样",
    });

    expect(reflection.nextTimeStrategy).toBeDefined();
    expect(reflection.nextTimeStrategy?.join(" ")).toContain("优先判断是否需要调用工具");
  });
});
