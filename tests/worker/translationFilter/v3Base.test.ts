import { describe, expect, it } from "vitest";
import {
  translationNeedsRefresh,
  passesCoverAndOutdatedRules,
} from "../../../worker/src/services/translationFilter/v3Base.js";

describe("translationNeedsRefresh", () => {
  it("needs refresh when translation row missing", () => {
    expect(translationNeedsRefresh(undefined)).toBe(true);
  });

  it("needs refresh when outdated=true", () => {
    expect(translationNeedsRefresh({ key: "title", outdated: true, value: "x" })).toBe(true);
  });

  it("needs refresh when value empty", () => {
    expect(translationNeedsRefresh({ key: "title", outdated: false, value: "" })).toBe(true);
    expect(translationNeedsRefresh({ key: "title", outdated: false })).toBe(true);
    expect(translationNeedsRefresh({ key: "title", outdated: false, value: "  " })).toBe(true);
  });

  it("does not need refresh when current non-empty translation", () => {
    expect(
      translationNeedsRefresh({ key: "title", outdated: false, value: "Gotowe" }),
    ).toBe(false);
    expect(translationNeedsRefresh({ key: "title", outdated: null, value: "X" })).toBe(false);
  });
});

describe("passesCoverAndOutdatedRules", () => {
  it("isCover=true always passes", () => {
    expect(
      passesCoverAndOutdatedRules(
        [{ key: "title", outdated: false, value: "done" }],
        "title",
        true,
      ),
    ).toBe(true);
  });

  it("isCover=false passes outdated or empty, skips current translation", () => {
    const translations = [{ key: "title", outdated: false, value: "done" }];
    expect(passesCoverAndOutdatedRules(translations, "title", false)).toBe(false);
    expect(passesCoverAndOutdatedRules(translations, "body", false)).toBe(true);
    expect(
      passesCoverAndOutdatedRules(
        [{ key: "title", outdated: false, value: "" }],
        "title",
        false,
      ),
    ).toBe(true);
    expect(
      passesCoverAndOutdatedRules(
        [{ key: "title", outdated: true, value: "stale" }],
        "title",
        false,
      ),
    ).toBe(true);
  });
});
