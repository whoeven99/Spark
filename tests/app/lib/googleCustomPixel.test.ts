import { describe, expect, it } from "vitest";
import { generateGooglePurchaseCustomPixel } from "../../../app/lib/googleCustomPixel";

describe("generateGooglePurchaseCustomPixel", () => {
  it("embeds SLS mirror config without PII helpers for denied consent path", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-1234567890",
      conversionLabel: "label123",
      enhancedConversions: true,
      shopName: "demo.myshopify.com",
      ingestEndpoint: "https://app.example.com/api/pixel-ingest",
    });
    expect(script).toContain("'spark:google:' + googleEvent");
    expect(script).toContain("sendCheckoutGoogleEvent('begin_checkout'");
    expect(script).toContain("sendCheckoutGoogleEvent('add_payment_info'");
    expect(script).toContain("mirrorGoogleEvent('purchase'");
    expect(script).toContain("https://app.example.com/api/pixel-ingest");
    expect(script).toContain("demo.myshopify.com");
    expect(script).toContain("mirrorGoogleEvent");
    expect(script).toContain("checkout_started");
    expect(script).toContain("payment_info_submitted");
    expect(script).toContain("sentToGoogle");
    expect(script).toContain("enhancedConversions: !!SPARK_CONFIG.enhancedConversions");
    expect(script).not.toContain("not_sent");
  });

  it("generates parseable Custom Pixel JavaScript", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-1234567890",
      conversionLabel: "label123",
      enhancedConversions: true,
      shopName: "demo.myshopify.com",
      ingestEndpoint: "https://app.example.com/api/pixel-ingest",
    });
    // Shopify Custom Pixel 编辑器会做语法校验；生成物必须是合法 JS。
    expect(() => new Function(script)).not.toThrow();
  });

  it("rejects invalid tag id", () => {
    expect(() =>
      generateGooglePurchaseCustomPixel({ tagId: "bad" }),
    ).toThrow(/AW/);
  });
});
