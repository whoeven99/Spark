import { describe, expect, it } from "vitest";
import {
  ALLOWED_V4_TRANSITIONS,
  computeTranslationV4ProgressPercent,
  deriveStage,
  isV4TransitionAllowed,
  mergeV4JobMetrics,
} from "~/lib/translationV4/state";
import { EMPTY_V4_METRICS, type TranslationV4Job } from "~/server/translation/v4/types";

function baseJob(overrides: Partial<TranslationV4Job> = {}): TranslationV4Job {
  return {
    id: "job-1",
    shopName: "demo.myshopify.com",
    shopifyAccessToken: "token",
    source: "zh-CN",
    target: "ja",
    modules: ["PRODUCT"],
    aiModel: "deepseek-chat",
    aiModelUsed: null,
    aiProvider: null,
    engineUsage: null,
    limitPerType: 20,
    isCover: false,
    isHandle: false,
    status: "TRANSLATING",
    claimedBy: "worker-1",
    claimedAt: null,
    lastHeartbeat: null,
    blobPrefix: "tasks/v4/demo/job-1",
    metrics: { ...EMPTY_V4_METRICS },
    errorMessage: null,
    errorStage: null,
    createdBy: "demo.myshopify.com",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:05:00.000Z",
    ...overrides,
  };
}

describe("translationV4/state", () => {
  describe("mergeV4JobMetrics — monotonic (Math.max)", () => {
    it("never regresses below the persisted cosmos value when redis is 0/stale", () => {
      const job = baseJob({
        metrics: { ...EMPTY_V4_METRICS, translateDone: 7, translateTotal: 10 },
      });
      // Redis legitimately holds 0 (e.g. counter not yet written this run).
      const merged = mergeV4JobMetrics(job, { translateDone: "0", translateTotal: "10" });
      expect(merged.translateDone).toBe(7); // not 0
      expect(merged.translateTotal).toBe(10);
    });

    it("prefers the higher live redis value over cosmos", () => {
      const job = baseJob({
        metrics: { ...EMPTY_V4_METRICS, translateDone: 1, translateTotal: 10 },
      });
      const merged = mergeV4JobMetrics(job, { translateDone: "4", currentModule: "PRODUCT" });
      expect(merged.translateDone).toBe(4);
      expect(merged.currentModule).toBe("PRODUCT");
    });
  });

  describe("computeTranslationV4ProgressPercent — PAUSED keeps its stage %", () => {
    it("shows translate progress for a quota-paused job (errorStage=TRANSLATE)", () => {
      const pct = computeTranslationV4ProgressPercent(
        "PAUSED",
        { ...EMPTY_V4_METRICS, translateUnitDone: 30, translateUnitTotal: 100 },
        "TRANSLATE",
      );
      expect(pct).toBe(30);
    });

    it("shows writeback progress when paused mid-writeback", () => {
      const pct = computeTranslationV4ProgressPercent(
        "PAUSED",
        { ...EMPTY_V4_METRICS, writebackDone: 5, translateTotal: 20 },
        "WRITEBACK",
      );
      expect(pct).toBe(25);
    });

    it("COMPLETED is always 100; FAILED/CANCELLED are null", () => {
      expect(computeTranslationV4ProgressPercent("COMPLETED", EMPTY_V4_METRICS)).toBe(100);
      expect(computeTranslationV4ProgressPercent("FAILED", EMPTY_V4_METRICS)).toBeNull();
      expect(computeTranslationV4ProgressPercent("CANCELLED", EMPTY_V4_METRICS)).toBeNull();
    });
  });

  describe("isV4TransitionAllowed — state-machine guard", () => {
    it("terminal states are final (no outbound transitions)", () => {
      expect(ALLOWED_V4_TRANSITIONS.COMPLETED).toEqual([]);
      expect(ALLOWED_V4_TRANSITIONS.CANCELLED).toEqual([]);
      expect(isV4TransitionAllowed("CANCELLED", "WRITEBACK_QUEUED")).toBe(false);
      expect(isV4TransitionAllowed("CANCELLED", "TRANSLATE_QUEUED")).toBe(false);
      expect(isV4TransitionAllowed("COMPLETED", "TRANSLATING")).toBe(false);
    });

    it("a no-op (same status) is always allowed (metrics-only updates)", () => {
      expect(isV4TransitionAllowed("COMPLETED", "COMPLETED")).toBe(true);
      expect(isV4TransitionAllowed("TRANSLATING", "TRANSLATING")).toBe(true);
    });

    it("allows the real happy-path + branch transitions", () => {
      expect(isV4TransitionAllowed("INIT_QUEUED", "INITIALIZING")).toBe(true);
      expect(isV4TransitionAllowed("INITIALIZING", "TRANSLATE_QUEUED")).toBe(true);
      expect(isV4TransitionAllowed("INITIALIZING", "COMPLETED")).toBe(true); // empty init
      expect(isV4TransitionAllowed("TRANSLATING", "WRITEBACK_QUEUED")).toBe(true);
      expect(isV4TransitionAllowed("TRANSLATING", "CANCELLED")).toBe(true); // cancel = discard
      expect(isV4TransitionAllowed("WRITING_BACK", "PAUSED")).toBe(true); // pause-after-writeback
      expect(isV4TransitionAllowed("VERIFYING", "COMPLETED")).toBe(true);
      expect(isV4TransitionAllowed("PAUSED", "TRANSLATE_QUEUED")).toBe(true); // resume
      expect(isV4TransitionAllowed("FAILED", "WRITEBACK_QUEUED")).toBe(true); // resume
    });

    it("allows stale-reset re-queue transitions", () => {
      expect(isV4TransitionAllowed("INITIALIZING", "INIT_QUEUED")).toBe(true);
      expect(isV4TransitionAllowed("TRANSLATING", "TRANSLATE_QUEUED")).toBe(true);
      expect(isV4TransitionAllowed("WRITING_BACK", "WRITEBACK_QUEUED")).toBe(true);
      expect(isV4TransitionAllowed("VERIFYING", "VERIFY_QUEUED")).toBe(true);
    });

    it("dead states INIT_DONE / TRANSLATE_DONE have no inbound edges (unreachable)", () => {
      for (const targets of Object.values(ALLOWED_V4_TRANSITIONS)) {
        expect(targets).not.toContain("INIT_DONE");
        expect(targets).not.toContain("TRANSLATE_DONE");
      }
    });

    it("rejects nonsensical skips", () => {
      expect(isV4TransitionAllowed("INIT_QUEUED", "VERIFYING")).toBe(false);
      expect(isV4TransitionAllowed("TRANSLATE_QUEUED", "COMPLETED")).toBe(false);
      expect(isV4TransitionAllowed("COMPLETED", "PAUSED")).toBe(false);
    });
  });

  describe("deriveStage", () => {
    it("maps each running status to its pipeline stage", () => {
      expect(deriveStage("INITIALIZING")).toBe("INIT");
      expect(deriveStage("TRANSLATING")).toBe("TRANSLATE");
      expect(deriveStage("WRITEBACK_QUEUED")).toBe("WRITEBACK");
      expect(deriveStage("VERIFYING")).toBe("VERIFY");
    });

    it("falls back to INIT for non-stage statuses", () => {
      expect(deriveStage("CREATED")).toBe("INIT");
      expect(deriveStage("PAUSED")).toBe("INIT");
    });
  });
});
