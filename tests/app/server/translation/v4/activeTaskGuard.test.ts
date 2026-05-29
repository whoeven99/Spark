import { describe, expect, it, vi } from "vitest";
import {
  normalizeTranslationLocale,
  sameTranslationLocale,
} from "../../../../../app/server/translation/v4/localeUtils";

vi.mock("../../../../../app/server/translation/v4/cosmosV4Store.server", () => ({
  existsBlockingV4Job: vi.fn(),
}));

describe("normalizeTranslationLocale", () => {
  it("normalizes underscore and casing", () => {
    expect(normalizeTranslationLocale("zh_CN")).toBe("zh-CN");
    expect(normalizeTranslationLocale(" en ")).toBe("en");
    expect(normalizeTranslationLocale("pt-br")).toBe("pt-BR");
  });

  it("handles empty input", () => {
    expect(normalizeTranslationLocale("")).toBe("");
    expect(normalizeTranslationLocale(null)).toBe("");
  });
});

describe("sameTranslationLocale", () => {
  it("matches equivalent locale codes", () => {
    expect(sameTranslationLocale("zh-CN", "zh_CN")).toBe(true);
    expect(sameTranslationLocale("en", "fr")).toBe(false);
  });
});

describe("existsBlockingV4Task", () => {
  it("uses ACTIVE statuses and delegates to cosmos store", async () => {
    const { existsBlockingV4Job } = await import(
      "../../../../../app/server/translation/v4/cosmosV4Store.server"
    );
    vi.mocked(existsBlockingV4Job).mockResolvedValue(true);

    const { existsBlockingV4Task, BLOCKING_V4_STATUSES } = await import(
      "../../../../../app/server/translation/v4/activeTaskGuard.server"
    );

    expect(BLOCKING_V4_STATUSES).toContain("INITIALIZING");
    expect(BLOCKING_V4_STATUSES).not.toContain("PAUSED");

    const blocked = await existsBlockingV4Task("demo.myshopify.com", "zh-CN", "en");
    expect(blocked).toBe(true);
    expect(existsBlockingV4Job).toHaveBeenCalledWith(
      "demo.myshopify.com",
      "zh-CN",
      "en",
      BLOCKING_V4_STATUSES,
    );
  });
});
