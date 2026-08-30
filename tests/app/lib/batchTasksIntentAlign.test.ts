import { describe, expect, it } from "vitest";
import {
  detectPictureTranslateTargetLanguage,
  detectProductImproveTargetLanguage,
  isPictureTranslateUserIntent,
} from "~/lib/chatCardFallback";
import {
  alignBatchTasksPayloadWithUserIntent,
  normalizeBatchTasksPayloadWithUserIntent,
  coerceBatchTasksFormPayload,
  type BatchTasksFormPayload,
} from "~/lib/batchTasksFormPayload";

const WORKSPACE_CONTEXT = `[工作台上下文]
- 已选商品（共 1 个）：
  • USOR Steel Toe Shoes [ID: gid://shopify/Product/7783635812375] [图片: https://cdn.example/a.jpg]
[用户消息]帮我翻译这个商品的图片，为简体中文`;

function batchPayload(over: Partial<BatchTasksFormPayload> = {}): BatchTasksFormPayload {
  return coerceBatchTasksFormPayload({
    taskType: "product_improve",
    products: [{ id: "gid://shopify/Product/1", title: "鞋", imageUrl: "https://x" }],
    targetLanguage: "en",
    sourceLanguage: "auto",
    ...over,
  });
}

describe("isPictureTranslateUserIntent", () => {
  it("命中『翻译图片』意图（含工作台上下文包裹）", () => {
    expect(isPictureTranslateUserIntent(WORKSPACE_CONTEXT)).toBe(true);
    expect(isPictureTranslateUserIntent("帮我翻译这张商品主图")).toBe(true);
    expect(isPictureTranslateUserIntent("translate the product image")).toBe(true);
  });

  it("翻译文案/描述不算图片翻译", () => {
    expect(isPictureTranslateUserIntent("帮我翻译商品描述")).toBe(false);
    expect(isPictureTranslateUserIntent("翻译这个商品的标题")).toBe(false);
  });

  it("与图片无关或与翻译无关时不命中", () => {
    expect(isPictureTranslateUserIntent("帮我生成商品描述")).toBe(false);
    expect(isPictureTranslateUserIntent("这张图片好看吗")).toBe(false);
  });

  it("不被工作台上下文里的 [图片: url] 误伤", () => {
    const onlyContext = `[工作台上下文]
  • A [ID: gid://shopify/Product/1] [图片: https://cdn/a.jpg]
[用户消息]帮我优化商品描述`;
    expect(isPictureTranslateUserIntent(onlyContext)).toBe(false);
  });
});

describe("detectPictureTranslateTargetLanguage", () => {
  it("简体中文 → zh，繁体 → zh-tw", () => {
    expect(detectPictureTranslateTargetLanguage("翻译图片，为简体中文")).toBe("zh");
    expect(detectPictureTranslateTargetLanguage("翻译图片成繁体中文")).toBe("zh-tw");
  });

  it("英/日/韩", () => {
    expect(detectPictureTranslateTargetLanguage("翻译图片成英文")).toBe("en");
    expect(detectPictureTranslateTargetLanguage("翻译图片成日语")).toBe("ja");
    expect(detectPictureTranslateTargetLanguage("翻译图片成韩语")).toBe("ko");
  });

  it("识别不到返回 null", () => {
    expect(detectPictureTranslateTargetLanguage("翻译这个商品的图片")).toBeNull();
  });
});

describe("alignBatchTasksPayloadWithUserIntent", () => {
  it("事故复现：product_improve + 图片翻译意图 → 纠正为 picture_translate/zh", () => {
    const aligned = alignBatchTasksPayloadWithUserIntent(batchPayload(), WORKSPACE_CONTEXT);
    expect(aligned.taskType).toBe("picture_translate");
    expect(aligned.targetLanguage).toBe("zh");
    expect(aligned.sourceLanguage).toBe("auto");
    expect(aligned.products).toHaveLength(1);
  });

  it("识别不到目标语言时回落 zh", () => {
    const aligned = alignBatchTasksPayloadWithUserIntent(
      batchPayload(),
      "[用户消息]帮我翻译这个商品的图片",
    );
    expect(aligned.taskType).toBe("picture_translate");
    expect(aligned.targetLanguage).toBe("zh");
  });

  it("翻译描述意图不纠偏，保持 product_improve", () => {
    const aligned = alignBatchTasksPayloadWithUserIntent(
      batchPayload(),
      "[用户消息]帮我翻译商品描述为英文",
    );
    expect(aligned.taskType).toBe("product_improve");
    expect(aligned.targetLanguage).toBe("en");
  });

  it("已是 picture_translate 时保持不变", () => {
    const original = batchPayload({ taskType: "picture_translate", targetLanguage: "ja" });
    const aligned = alignBatchTasksPayloadWithUserIntent(original, WORKSPACE_CONTEXT);
    expect(aligned).toEqual(original);
  });
});

describe("detectProductImproveTargetLanguage", () => {
  it("recognizes explicit language requests for product copy", () => {
    expect(
      detectProductImproveTargetLanguage("[用户消息]optimize this product description in English", "zh-CN"),
    ).toBe("en");
    expect(
      detectProductImproveTargetLanguage("[用户消息]optimize this product description in Chinese", "en"),
    ).toBe("zh-CN");
  });

  it("falls back to English when the user input is clearly English but payload was Chinese", () => {
    expect(
      detectProductImproveTargetLanguage("[用户消息]product optimization", "zh-CN"),
    ).toBe("en");
  });
});

describe("normalizeBatchTasksPayloadWithUserIntent", () => {
  it("corrects product_improve target language to English for English user input", () => {
    const normalized = normalizeBatchTasksPayloadWithUserIntent(
      batchPayload({ targetLanguage: "zh-CN" }),
      "[用户消息]product optimization",
    );
    expect(normalized.taskType).toBe("product_improve");
    expect(normalized.targetLanguage).toBe("en");
  });
});
