import { describe, expect, it } from "vitest";
import {
  getExtensionFromUrl,
  isDifferentImageTranslateInputCode,
  isSupportModelAndImageType,
  mapZhTwToZhHantForVolcano,
} from "../../../../app/server/pictureTranslate/pictureTranslatePictureUtils.server";

describe("getExtensionFromUrl", () => {
  it("matches PictureUtilsTest", () => {
    expect(getExtensionFromUrl("https://example.com/image.jpg")).toBe("jpg");
    expect(getExtensionFromUrl("https://example.com/image.png")).toBe("png");
    expect(getExtensionFromUrl("https://example.com/image.jpg?v=123")).toBe(
      "jpg",
    );
    expect(getExtensionFromUrl("image.png?param=value")).toBe("png");
  });

  it("returns null when no extension", () => {
    expect(getExtensionFromUrl("image")).toBeNull();
    expect(getExtensionFromUrl("/path/to/file")).toBeNull();
    expect(getExtensionFromUrl("https://example.com/image.")).toBeNull();
    expect(getExtensionFromUrl("file.")).toBeNull();
  });
});

describe("mapZhTwToZhHantForVolcano", () => {
  it("maps zh-tw to zh-Hant only", () => {
    expect(mapZhTwToZhHantForVolcano("zh-tw")).toBe("zh-Hant");
    expect(mapZhTwToZhHantForVolcano("zh")).toBe("zh");
    expect(mapZhTwToZhHantForVolcano("en")).toBe("en");
  });
});

describe("isSupportModelAndImageType (model 2)", () => {
  it("matches PictureUtilsTest — jpeg excluded for volcano", () => {
    expect(isSupportModelAndImageType("png", 2)).toBe(true);
    expect(isSupportModelAndImageType("jpg", 2)).toBe(true);
    expect(isSupportModelAndImageType("jpeg", 2)).toBe(false);
    expect(isSupportModelAndImageType("PNG", 2)).toBe(true);
  });
});

describe("isDifferentImageTranslateInputCode (model 2)", () => {
  it("matches PictureUtilsTest boundaries", () => {
    expect(isDifferentImageTranslateInputCode("en", "zh", 2)).toBe(true);
    expect(isDifferentImageTranslateInputCode("zh", "en", 2)).toBe(true);
    expect(isDifferentImageTranslateInputCode("xx", "en", 2)).toBe(false);
  });

  it("accepts zh-Hant in volcano input set", () => {
    expect(isDifferentImageTranslateInputCode("zh-Hant", "en", 2)).toBe(true);
  });

  it("maps zh-tw before check (service behavior)", () => {
    const source = mapZhTwToZhHantForVolcano("zh-tw");
    const target = mapZhTwToZhHantForVolcano("en");
    expect(isDifferentImageTranslateInputCode(source, target, 2)).toBe(true);
  });
});
