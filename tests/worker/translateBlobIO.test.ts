import { describe, expect, it } from "vitest";
import {
  encodeResourceIdForBlob,
  translatedResourceBlobPath,
} from "../../worker/src/services/translateBlobIO.js";

describe("translateBlobIO", () => {
  it("encodeResourceIdForBlob handles Shopify GIDs", () => {
    const gid = "gid://shopify/Product/7434315202583";
    const encoded = encodeResourceIdForBlob(gid);
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain(":");
  });

  it("translatedResourceBlobPath uses resources subdirectory", () => {
    const path = translatedResourceBlobPath(
      "tasks/v4/shop.myshopify.com/job-1",
      "PRODUCT",
      "gid://shopify/Product/1",
    );
    expect(path).toContain("/translate/PRODUCT/resources/");
    expect(path.endsWith(".json")).toBe(true);
  });
});
