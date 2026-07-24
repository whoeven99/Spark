import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  pictureTranslateToolSchema,
  resolvePictureTranslateInput,
} from "../../../../../../app/server/ai/skills/pictureTranslate/pictureTranslate.schema";

describe("pictureTranslateToolSchema", () => {
  it("accepts https imageUrl with required targetLanguage", () => {
    const parsed = pictureTranslateToolSchema.parse({
      imageUrl: "https://cdn.example.com/demo.jpg",
      targetLanguage: "en",
    });
    expect(parsed.imageUrl).toBe("https://cdn.example.com/demo.jpg");
    expect(parsed.targetLanguage).toBe("en");
  });

  it("accepts imageBase64 without imageUrl", () => {
    const parsed = pictureTranslateToolSchema.parse({
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      targetLanguage: "ja",
    });
    expect(parsed.imageBase64).toBe("iVBORw0KGgoAAAANSUhEUgAAAAUA");
    expect(parsed.targetLanguage).toBe("ja");
  });

  it("rejects when imageUrl and imageBase64 are both missing", () => {
    expect(() =>
      pictureTranslateToolSchema.parse({
        targetLanguage: "fr",
      }),
    ).toThrow(ZodError);
  });

  it("rejects non-https imageUrl", () => {
    expect(() =>
      pictureTranslateToolSchema.parse({
        imageUrl: "http://cdn.example.com/demo.jpg",
        targetLanguage: "en",
      }),
    ).toThrow(ZodError);
  });
});

describe("resolvePictureTranslateInput", () => {
  it("defaults sourceLanguage to auto", () => {
    const resolved = resolvePictureTranslateInput({
      imageUrl: "https://cdn.example.com/demo.jpg",
      targetLanguage: "de",
    });
    expect(resolved.sourceLanguage).toBe("auto");
  });

  it("keeps provided sourceLanguage", () => {
    const resolved = resolvePictureTranslateInput({
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      targetLanguage: "de",
      sourceLanguage: "zh",
    });
    expect(resolved.sourceLanguage).toBe("zh");
  });
});
