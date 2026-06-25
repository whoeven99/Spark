import { describe, expect, it } from "vitest";
import {
  isAutoTranslationJob,
  TSF_AUTO_TASK_SOURCE,
  TS_FRONTEND_TASK_SOURCE,
} from "../../worker/src/services/cosmosV4.js";

describe("isAutoTranslationJob", () => {
  it("returns true only for TsFrontend-Auto", () => {
    expect(isAutoTranslationJob({ taskSource: TSF_AUTO_TASK_SOURCE })).toBe(true);
  });

  it("returns false for TsFrontend manual tasks", () => {
    expect(isAutoTranslationJob({ taskSource: TS_FRONTEND_TASK_SOURCE })).toBe(false);
  });

  it("returns false when taskSource is missing (Spark native manual)", () => {
    expect(isAutoTranslationJob({})).toBe(false);
  });
});
