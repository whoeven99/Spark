import { describe, expect, it } from "vitest";
import { initI18n } from "../../../app/i18n";
import {
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
} from "../../../app/lib/taskProposalPayload";
import {
  formatTaskProposalParamSummary,
  relocalizeLegacyParamSummaryLine,
  resolveTaskProposalDisabledReason,
  resolveTaskProposalTitle,
  resolveTaskRunTitle,
} from "../../../app/lib/taskProposalDisplay";

describe("taskProposalDisplay", () => {
  it("resolves batch product improve title by skillId in English", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(
      resolveTaskProposalTitle(
        { skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID, title: "批量生成商品描述" },
        t,
      ),
    ).toBe("Batch generate product descriptions");
  });

  it("resolves batch product improve title by skillId in Chinese", () => {
    const i18n = initI18n("zh-CN");
    const t = i18n.t.bind(i18n);
    expect(
      resolveTaskProposalTitle(
        { skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID, title: "fallback" },
        t,
      ),
    ).toBe("批量生成商品描述");
  });

  it("formats target language param summary in English", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(
      formatTaskProposalParamSummary({ key: "targetLanguage", label: "目标语言" }, "en", t),
    ).toBe("Target language: English");
  });

  it("relocalizes legacy Chinese param summary lines", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(relocalizeLegacyParamSummaryLine("目标语言：English", t)).toBe(
      "Target language: English",
    );
    expect(relocalizeLegacyParamSummaryLine("目标语言：简体中文", t)).toBe(
      "Target language: 简体中文",
    );
  });

  it("resolveTaskRunTitle uses skillId over stored Chinese title", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(
      resolveTaskRunTitle(
        {
          skillId: BATCH_PICTURE_TRANSLATE_SKILL_ID,
          title: "批量翻译商品图片",
        },
        t,
      ),
    ).toBe("Batch translate product images");
  });

  it("formats zh-CN target language via language catalog in English UI", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(
      formatTaskProposalParamSummary({ key: "targetLanguage", label: "目标语言" }, "zh-CN", t),
    ).toBe("Target language: Chinese");
  });

  it("formats auto source language in English", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(
      formatTaskProposalParamSummary({ key: "sourceLanguage", label: "源语言" }, "auto", t),
    ).toBe("Source language: Auto detect");
  });

  it("resolves no_primary_image disabled reason in English", () => {
    const i18n = initI18n("en");
    const t = i18n.t.bind(i18n);
    expect(resolveTaskProposalDisabledReason("no_primary_image", t)).toBe("No main image");
  });
});
