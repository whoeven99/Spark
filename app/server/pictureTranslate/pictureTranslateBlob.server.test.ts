import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES,
  resolvePictureTranslateBlobSasTtlMinutes,
} from "./pictureTranslateBlob.server";

describe("resolvePictureTranslateBlobSasTtlMinutes", () => {
  const original = process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES;
    } else {
      process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES = original;
    }
  });

  it("defaults to 7 days when env is unset", () => {
    delete process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES;
    expect(resolvePictureTranslateBlobSasTtlMinutes()).toBe(
      DEFAULT_PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES,
    );
  });

  it("uses positive env override", () => {
    process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES = "120";
    expect(resolvePictureTranslateBlobSasTtlMinutes()).toBe(120);
  });

  it("returns null when explicitly disabled with 0", () => {
    process.env.PICTURE_TRANSLATE_BLOB_SAS_TTL_MINUTES = "0";
    expect(resolvePictureTranslateBlobSasTtlMinutes()).toBeNull();
  });
});
