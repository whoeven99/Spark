import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTokenPackMessage,
  sendTokenPackFeishuNotify,
} from "../../../../app/server/feishu/scenarios/sendTokenPackFeishuNotify.server";

vi.mock(
  "../../../../app/server/billing/plans/planCatalog.server",
  () => ({
    getPlanByKey: vi.fn().mockResolvedValue({
      planKey: "token-pack-10k",
      displayName: "10K Tokens",
      priceAmount: "9.99",
      currencyCode: "USD",
      tokens: 10000,
    }),
  }),
);

describe("buildTokenPackMessage", () => {
  it("includes shop, planKey, and tokens", () => {
    const message = buildTokenPackMessage(
      {
        shop: "demo.myshopify.com",
        appName: "generate-description",
        planKey: "token-pack-10k",
      },
      {
        displayName: "10K Tokens",
        priceAmount: "9.99",
        currencyCode: "USD",
        tokens: 10000,
      },
    );

    expect(message).toContain("按量购包成功");
    expect(message).toContain("店铺: demo.myshopify.com");
    expect(message).toContain("token-pack-10k");
    expect(message).toContain("Token: 10000");
    expect(message).toContain("价格: 【9.99 USD】");
    expect(message).toMatch(/时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });
});

describe("sendTokenPackFeishuNotify", () => {
  const env = process.env;

  beforeEach(() => {
    process.env.FEISHU_ENABLED = "true";
    process.env.APP_ENTRY = "generate-description";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("skips when FEISHU_ENABLED is false", async () => {
    process.env.FEISHU_ENABLED = "false";
    process.env.FEISHU_WEBHOOK_URL_SUBSCRIPTION = "https://example.com/hook";

    const result = await sendTokenPackFeishuNotify({
      shop: "demo.myshopify.com",
      appName: "generate-description",
      planKey: "token-pack-10k",
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: "disabled",
    });
  });

  it("skips when webhook url is not configured", async () => {
    delete process.env.FEISHU_WEBHOOK_URL_SUBSCRIPTION;

    const result = await sendTokenPackFeishuNotify({
      shop: "demo.myshopify.com",
      appName: "generate-description",
      planKey: "token-pack-10k",
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: "no_webhook_url",
    });
  });

  it("returns ok on successful webhook response", async () => {
    process.env.FEISHU_WEBHOOK_URL_SUBSCRIPTION = "https://example.com/hook";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0 }),
      }),
    );

    const result = await sendTokenPackFeishuNotify({
      shop: "demo.myshopify.com",
      appName: "generate-description",
      planKey: "token-pack-10k",
    });

    expect(result).toEqual({ ok: true, channel: "ops_subscription" });
  });

  it("skips when billing is not enabled for app", async () => {
    const result = await sendTokenPackFeishuNotify({
      shop: "demo.myshopify.com",
      appName: "spark-zz",
      planKey: "token-pack-10k",
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: "billing_not_enabled",
    });
  });
});
