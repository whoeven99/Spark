import { describe, expect, it } from "vitest";
import { SPARK_AVATAR_SRC_PROD, SPARK_AVATAR_SRC_TEST } from "../../../app/lib/sparkAvatar";
import { getSparkAvatarSrc, isTestSparkBrand } from "../../../app/lib/sparkAvatar.server";

describe("getSparkAvatarSrc", () => {
  it("prod URL uses purple avatar", () => {
    expect(
      getSparkAvatarSrc({
        SHOPIFY_APP_URL: "https://spark-prod.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe(SPARK_AVATAR_SRC_PROD);
  });

  it("marks test URL as test brand", () => {
    expect(
      isTestSparkBrand({
        SHOPIFY_APP_URL: "https://aiassistant-wi7b.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe(true);
    expect(
      isTestSparkBrand({
        SHOPIFY_APP_URL: "https://spark-prod.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe(false);
  });

  it("test URL uses teal avatar even if NODE_ENV is prod", () => {
    expect(
      getSparkAvatarSrc({
        SHOPIFY_APP_URL: "https://aiassistant-wi7b.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe(SPARK_AVATAR_SRC_TEST);
  });
});
