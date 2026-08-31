import { describe, expect, it } from "vitest";
import {
  formatOpsNotifyPrice,
  formatOpsNotifyTime,
  formatOpsNotifyTitle,
  resolveOpsEnvLabel,
} from "../../../../app/server/feishu/feishuMessageFormat.server";

describe("formatOpsNotifyTime", () => {
  it("formats as YYYY-MM-DD HH:mm in Asia/Shanghai", () => {
    const formatted = formatOpsNotifyTime(
      new Date("2026-05-22T07:13:00.257Z"),
    );
    expect(formatted).toBe("2026-05-22 15:13");
  });
});

describe("formatOpsNotifyPrice", () => {
  it("wraps amount and currency in brackets", () => {
    expect(formatOpsNotifyPrice("9.99", "USD")).toBe("【9.99 USD】");
    expect(formatOpsNotifyPrice("79.99", "USD")).toBe("【79.99 USD】");
  });
});

describe("resolveOpsEnvLabel", () => {
  it("prefers explicit SPARK_OPS_ENV over URL", () => {
    expect(
      resolveOpsEnvLabel({
        SPARK_OPS_ENV: "prod",
        SHOPIFY_APP_URL: "https://aiassistant-wi7b.onrender.com",
      }),
    ).toBe("生产");
  });

  it("maps Render prod / test app URLs", () => {
    expect(
      resolveOpsEnvLabel({
        SHOPIFY_APP_URL: "https://spark-prod.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe("生产");
    expect(
      resolveOpsEnvLabel({
        SHOPIFY_APP_URL: "https://aiassistant-wi7b.onrender.com",
        NODE_ENV: "prod",
      }),
    ).toBe("测试");
  });

  it("falls back to NODE_ENV when URL is absent", () => {
    expect(resolveOpsEnvLabel({ NODE_ENV: "prod" })).toBe("生产");
    expect(resolveOpsEnvLabel({ NODE_ENV: "test" })).toBe("测试");
    expect(resolveOpsEnvLabel({ NODE_ENV: "development" })).toBe("本地");
  });
});

describe("formatOpsNotifyTitle", () => {
  it("prefixes title with env label using fullwidth brackets", () => {
    expect(
      formatOpsNotifyTitle("🎁 安装福利 Token 已自动发放", {
        SHOPIFY_APP_URL: "https://aiassistant-wi7b.onrender.com",
      }),
    ).toBe("【测试】🎁 安装福利 Token 已自动发放");
    expect(
      formatOpsNotifyTitle("🚨 Shopify App 已卸载", {
        SHOPIFY_APP_URL: "https://spark-prod.onrender.com",
      }),
    ).toBe("【生产】🚨 Shopify App 已卸载");
  });
});
