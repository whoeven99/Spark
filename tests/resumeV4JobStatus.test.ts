import { describe, expect, it } from "vitest";
import {
  resolveResumeV4JobStatus,
  writebackNeedsRetry,
} from "~/server/translation/v4/resumeV4JobStatus";
import type { TranslationV4Metrics } from "~/server/translation/v4/types";

const baseMetrics = (): TranslationV4Metrics => ({
  initTotal: 2165,
  initDone: 2165,
  translateTotal: 2165,
  translateDone: 2165,
  translateFailed: 0,
  translateFallback: 0,
  translateUnitTotal: 8243,
  translateUnitDone: 8243,
  writebackTotal: 2165,
  writebackDone: 473,
  writebackFailed: 1692,
  verifyTotal: 1692,
  verifyDone: 21,
  verifyFailed: 0,
  usedTokens: 0,
});

describe("writebackNeedsRetry", () => {
  it("returns true when writeback incomplete or has failures", () => {
    expect(writebackNeedsRetry(baseMetrics())).toBe(true);
    expect(
      writebackNeedsRetry({
        ...baseMetrics(),
        writebackDone: 2165,
        writebackFailed: 3,
      }),
    ).toBe(true);
  });

  it("returns false when writeback fully succeeded", () => {
    expect(
      writebackNeedsRetry({
        ...baseMetrics(),
        writebackDone: 2165,
        writebackFailed: 0,
      }),
    ).toBe(false);
  });
});

describe("resolveResumeV4JobStatus", () => {
  it("prefers WRITEBACK_QUEUED over VERIFY when writeback still pending", () => {
    expect(
      resolveResumeV4JobStatus("FAILED", "VERIFY", baseMetrics()),
    ).toBe("WRITEBACK_QUEUED");
  });

  it("uses errorStage when writeback is complete", () => {
    const metrics = {
      ...baseMetrics(),
      writebackDone: 2165,
      writebackFailed: 0,
    };
    expect(resolveResumeV4JobStatus("FAILED", "VERIFY", metrics)).toBe(
      "VERIFY_QUEUED",
    );
    expect(resolveResumeV4JobStatus("PAUSED", "TRANSLATE", metrics)).toBe(
      "TRANSLATE_QUEUED",
    );
  });

  it("returns null for non-resumable statuses", () => {
    expect(
      resolveResumeV4JobStatus("VERIFYING", "VERIFY", baseMetrics()),
    ).toBeNull();
  });
});
