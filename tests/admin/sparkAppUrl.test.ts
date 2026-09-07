import { afterEach, describe, expect, it } from "vitest";
import {
  SPARK_CLIENT_ID_PROD,
  SPARK_CLIENT_ID_TEST,
  buildReferralInstallUrl,
} from "../../admin/server/lib/sparkAppUrl";

const SAVED = {
  SPARK_REFERRAL_LINK_BASE: process.env.SPARK_REFERRAL_LINK_BASE,
  SPARK_SHOPIFY_CLIENT_ID: process.env.SPARK_SHOPIFY_CLIENT_ID,
  SPARK_DATABASE_URL: process.env.SPARK_DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("buildReferralInstallUrl", () => {
  it("短链基址优先", () => {
    process.env.SPARK_REFERRAL_LINK_BASE = "https://go.example.com/";
    expect(buildReferralInstallUrl("SPARK-HJ3HTT")).toBe(
      "https://go.example.com/SPARK-HJ3HTT",
    );
  });

  it("测库用测试应用 client_id", () => {
    delete process.env.SPARK_REFERRAL_LINK_BASE;
    delete process.env.SPARK_SHOPIFY_CLIENT_ID;
    process.env.SPARK_DATABASE_URL = "libsql://spark-test-whoeven99.example";
    expect(buildReferralInstallUrl("SPARK-HJ3HTT")).toBe(
      `https://admin.shopify.com/oauth/install?client_id=${SPARK_CLIENT_ID_TEST}`,
    );
  });

  it("产库用产应用 client_id", () => {
    delete process.env.SPARK_REFERRAL_LINK_BASE;
    delete process.env.SPARK_SHOPIFY_CLIENT_ID;
    process.env.SPARK_DATABASE_URL = "libsql://spark-prod-whoeven99.example";
    expect(buildReferralInstallUrl()).toBe(
      `https://admin.shopify.com/oauth/install?client_id=${SPARK_CLIENT_ID_PROD}`,
    );
  });
});
