import { describe, expect, it } from "vitest";
import { translateImageResponseSchema } from "../../../../app/server/pictureTranslate/volcenginePictureTranslate.server";

describe("translateImageResponseSchema", () => {
  it("accepts success payload when ResponseMetadata is null", () => {
    const parsed = translateImageResponseSchema.safeParse({
      Image: "aGVsbG8=",
      ResponseMetadata: null,
      ResponseMetaData: { RequestId: "req-1" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.Image).toBe("aGVsbG8=");
    }
  });

  it("accepts omitted metadata fields", () => {
    const parsed = translateImageResponseSchema.safeParse({
      Image: "aGVsbG8=",
    });
    expect(parsed.success).toBe(true);
  });
});
