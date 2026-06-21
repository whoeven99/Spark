import { describe, expect, it } from "vitest";
import {
  metaTranslate,
  shouldTranslateThemeKey,
  translationRuleJudgment,
  whiteListTranslate,
} from "../../../worker/src/services/translationFilter/judgeTranslateUtils.js";

describe("translationRuleJudgment", () => {
  it("rejects null or blank", () => {
    expect(translationRuleJudgment("k", "")).toBe(false);
    expect(translationRuleJudgment("k", "   ")).toBe(false);
  });

  it("rejects ISO8601 datetime", () => {
    expect(translationRuleJudgment("k", "2026-03-20T13:07:15+08:00")).toBe(false);
  });

  it("rejects empty body tag", () => {
    expect(translationRuleJudgment("k", "<body></body>")).toBe(false);
  });

  it("rejects px, booleans, hash prefix", () => {
    expect(translationRuleJudgment("k", "12px")).toBe(false);
    expect(translationRuleJudgment("k", "true")).toBe(false);
    expect(translationRuleJudgment("k", "#abc")).toBe(false);
  });

  it("rejects reject-rule patterns", () => {
    expect(translationRuleJudgment("k", "f72ySxJ79BVY6Jx")).toBe(false);
    expect(translationRuleJudgment("k", "test@example.com")).toBe(false);
    expect(translationRuleJudgment("k", "+8613812345678")).toBe(false);
  });

  it("allows normal text", () => {
    expect(translationRuleJudgment("k", "Hello world")).toBe(true);
    expect(translationRuleJudgment("k", "这是一个商品标题")).toBe(true);
  });

  it("allows HTML bodies even when inline styles contain px units", () => {
    const html =
      '<div style="font-size:16px"><h2>Core Key</h2><p>NinescapeLand playground equipment.</p></div>';
    expect(translationRuleJudgment("body_html", html)).toBe(true);
  });
});

describe("shouldTranslateThemeKey", () => {
  it("rejects value starting with =", () => {
    expect(shouldTranslateThemeKey("k", "=1")).toBe(false);
  });

  it("rejects key containing captions", () => {
    expect(shouldTranslateThemeKey("section.captions", "text")).toBe(false);
  });
});

describe("whiteListTranslate", () => {
  it("matches colon-prefix ending with whitelist word", () => {
    expect(whiteListTranslate("block_heading:settings")).toBe(true);
    expect(whiteListTranslate("section:unknown_key")).toBe(false);
  });
});

describe("metaTranslate", () => {
  it("rejects positional values", () => {
    expect(metaTranslate("left")).toBe(false);
    expect(metaTranslate("top")).toBe(false);
    expect(metaTranslate("hello")).toBe(true);
  });
});
