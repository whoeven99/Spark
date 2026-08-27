import { describe, expect, it } from "vitest";
import { i18nText, isI18nText, renderI18nText } from "../../../app/lib/i18nText";

function createTranslate(dictionary: Record<string, string>) {
  return (key: string, options?: Record<string, unknown>) => {
    const template = dictionary[key] ?? (typeof options?.defaultValue === "string" ? options.defaultValue : key);
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ""));
  };
}

describe("i18nText", () => {
  it("builds a key-only payload", () => {
    expect(i18nText("today.home.subtitle")).toEqual({ key: "today.home.subtitle" });
  });

  it("includes params and fallback when provided", () => {
    expect(i18nText("today.home.todoCount", { count: 3 }, "3 todos")).toEqual({
      key: "today.home.todoCount",
      params: { count: 3 },
      fallback: "3 todos",
    });
  });
});

describe("isI18nText", () => {
  it("accepts objects with a key", () => {
    expect(isI18nText({ key: "today.backToToday" })).toBe(true);
    expect(isI18nText("today.backToToday")).toBe(false);
    expect(isI18nText(null)).toBe(false);
  });
});

describe("renderI18nText", () => {
  const t = createTranslate({
    "today.home.todoCount": "{{count}} executable todos ready",
  });

  it("returns empty string for nullish input", () => {
    expect(renderI18nText(t, null)).toBe("");
    expect(renderI18nText(t, undefined)).toBe("");
  });

  it("passes through unmigrated strings", () => {
    expect(renderI18nText(t, "返回经营")).toBe("返回经营");
  });

  it("translates a key with params", () => {
    expect(renderI18nText(t, i18nText("today.home.todoCount", { count: 4 }))).toBe(
      "4 executable todos ready",
    );
  });

  it("uses fallback when the key is missing", () => {
    expect(renderI18nText(t, i18nText("today.missing", undefined, "Back to Today"))).toBe(
      "Back to Today",
    );
  });

  it("returns the key when missing and no fallback is set", () => {
    expect(renderI18nText(t, { key: "today.missing" })).toBe("today.missing");
  });
});
