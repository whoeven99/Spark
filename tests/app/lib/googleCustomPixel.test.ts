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
    expect(script).toContain("spark:google:purchase");
    expect(script).toContain("https://app.example.com/api/pixel-ingest");
    expect(script).toContain("demo.myshopify.com");
    expect(script).toContain("mirrorPurchase");
    expect(script).toContain("sentToGoogle");
  });

  it("rejects invalid tag id", () => {
    expect(() =>
      generateGooglePurchaseCustomPixel({ tagId: "bad" }),
    ).toThrow(/AW/);
  });
});
