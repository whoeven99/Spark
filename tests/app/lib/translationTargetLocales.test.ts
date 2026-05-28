import { describe, expect, it } from "vitest";
import {
  normalizeTargetLocales,
  validateTargetLocales,
} from "../../../app/lib/translationTargetLocales";

const options = [
  { value: "fr", label: "French (fr)" },
  { value: "ja", label: "日本語 (ja)" },
  { value: "de", label: "German (de)" },
];

describe("normalizeTargetLocales", () => {
  it("dedupes and filters invalid, source, and unknown locales", () => {
    expect(
      normalizeTargetLocales(
        ["fr", " fr ", "ja", "en", "fr", "zh-CN"],
        options,
        "zh-CN",
      ),
    ).toEqual(["fr", "ja"]);
  });

  it("accepts single string input", () => {
    expect(normalizeTargetLocales("ja", options, "en")).toEqual(["ja"]);
  });

  it("returns empty for undefined or empty input", () => {
    expect(normalizeTargetLocales(undefined, options, "en")).toEqual([]);
    expect(normalizeTargetLocales("", options, "en")).toEqual([]);
    expect(normalizeTargetLocales([], options, "en")).toEqual([]);
  });
});

describe("validateTargetLocales", () => {
  it("requires at least one locale", () => {
    expect(validateTargetLocales([], "en")).toEqual({
      ok: false,
      message: "validationTargetRequired",
    });
  });

  it("rejects when target equals source", () => {
    expect(validateTargetLocales(["en"], "en")).toEqual({
      ok: false,
      message: "validationSameLocale",
    });
  });

  it("passes for valid locales", () => {
    expect(validateTargetLocales(["fr", "ja"], "en")).toEqual({ ok: true });
  });
});
