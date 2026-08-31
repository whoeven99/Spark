import { describe, expect, it } from "vitest";
import { buildPromoClaimMessage } from "../../../../app/server/feishu/scenarios/sendPromoClaimFeishuNotify.server";

describe("buildPromoClaimMessage", () => {
  it("uses install-promo title and key fields", () => {
    const message = buildPromoClaimMessage({
      shop: "demo.myshopify.com",
      appName: "Spark",
      campaignId: "install-welcome-1m",
      tokensDelta: 1_000_000,
      claimedAt: new Date("2026-05-22T07:13:00.257Z"),
    });

    expect(message).toMatch(/^\[(生产|测试|本地)\] 🎁 安装福利 Token 已自动发放/);
    expect(message).toContain("🎁 安装福利 Token 已自动发放");
    expect(message).toContain("店铺: demo.myshopify.com");
    expect(message).toContain("App: Spark");
    expect(message).toContain("活动: install-welcome-1m");
    expect(message).toContain("发放额度: 1,000,000 Token");
    expect(message).toContain("时间: 2026-05-22 15:13");
  });
});
