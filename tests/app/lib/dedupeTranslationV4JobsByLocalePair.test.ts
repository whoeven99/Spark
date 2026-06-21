import { describe, expect, it } from "vitest";
import {
  dedupeTranslationV4JobsByLocalePair,
  localePairKey,
} from "../../../app/lib/dedupeTranslationV4JobsByLocalePair";
import {
  EMPTY_V4_METRICS,
  type TranslationV4Job,
} from "../../../app/server/translation/v4/types";

function job(
  overrides: Pick<TranslationV4Job, "id" | "source" | "target"> &
    Partial<Pick<TranslationV4Job, "createdAt" | "updatedAt">>,
): TranslationV4Job {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: overrides.id,
    shopName: "test.myshopify.com",
    shopifyAccessToken: "",
    source: overrides.source,
    target: overrides.target,
    modules: ["PRODUCT"],
    aiModel: "gpt-4o-mini",
    aiModelUsed: null,
    aiProvider: null,
    engineUsage: null,
    limitPerType: 20,
    isCover: false,
    isHandle: false,
    status: "COMPLETED",
    claimedBy: null,
    claimedAt: null,
    lastHeartbeat: null,
    blobPrefix: "",
    metrics: EMPTY_V4_METRICS,
    errorMessage: null,
    errorStage: null,
    createdBy: "test",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? now,
  };
}

describe("localePairKey", () => {
  it("normalizes case for source and target", () => {
    expect(localePairKey("zh-CN", "JA")).toBe(localePairKey("zh-cn", "ja"));
  });
});

describe("dedupeTranslationV4JobsByLocalePair", () => {
  it("returns empty array for empty input", () => {
    expect(dedupeTranslationV4JobsByLocalePair([])).toEqual([]);
  });

  it("returns single job unchanged", () => {
    const only = job({ id: "a", source: "zh-CN", target: "ja" });
    expect(dedupeTranslationV4JobsByLocalePair([only])).toEqual([only]);
  });

  it("keeps newest job per locale pair by updatedAt", () => {
    const old = job({
      id: "old",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const mid = job({
      id: "mid",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const newest = job({
      id: "newest",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    const result = dedupeTranslationV4JobsByLocalePair([old, mid, newest]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("newest");
  });

  it("treats zh-CN and zh-cn as the same pair", () => {
    const lower = job({
      id: "lower",
      source: "zh-cn",
      target: "ja",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const upper = job({
      id: "upper",
      source: "ZH-CN",
      target: "JA",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const result = dedupeTranslationV4JobsByLocalePair([lower, upper]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("upper");
  });

  it("keeps one job per distinct locale pair", () => {
    const jaOld = job({
      id: "ja-old",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const de = job({
      id: "de",
      source: "zh-CN",
      target: "de",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const jaNew = job({
      id: "ja-new",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    const result = dedupeTranslationV4JobsByLocalePair([jaOld, de, jaNew]);
    expect(result.map((j) => j.id)).toEqual(["ja-new", "de"]);
  });

  it("orders results by first occurrence of each pair in input", () => {
    const de = job({ id: "de", source: "zh-CN", target: "de" });
    const jaOld = job({
      id: "ja-old",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const jaNew = job({
      id: "ja-new",
      source: "zh-CN",
      target: "ja",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    const result = dedupeTranslationV4JobsByLocalePair([jaOld, de, jaNew]);
    expect(result.map((j) => j.id)).toEqual(["ja-new", "de"]);
  });

  it("uses createdAt when updatedAt ties", () => {
    const older = job({
      id: "older",
      source: "en",
      target: "fr",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newerCreated = job({
      id: "newer-created",
      source: "en",
      target: "fr",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const result = dedupeTranslationV4JobsByLocalePair([older, newerCreated]);
    expect(result[0]?.id).toBe("newer-created");
  });
});
