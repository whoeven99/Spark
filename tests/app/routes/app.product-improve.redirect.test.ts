import { describe, expect, it } from "vitest";
import {
  buildEmbeddedAppPath,
  getAppHomePath,
} from "../../../app/config/appEntry.server";

describe("legacy /app/product-improve redirect", () => {
  it("keeps embedded query when sending the old entry to home", () => {
    const request = new Request(
      "https://example.com/app/product-improve?shop=ciwishop.myshopify.com&embedded=1&host=abc",
    );

    expect(buildEmbeddedAppPath(getAppHomePath(), request)).toBe(
      "/app?shop=ciwishop.myshopify.com&embedded=1&host=abc",
    );
  });
});
