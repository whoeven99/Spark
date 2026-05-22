import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendFeishuTextMessage } from "../../../../app/server/feishu/sendFeishuTextMessage.server";

describe("sendFeishuTextMessage", () => {
  const env = process.env;

  beforeEach(() => {
    process.env.FEISHU_ENABLED = "true";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("skips when FEISHU_ENABLED is false", async () => {
    process.env.FEISHU_ENABLED = "false";
    process.env.FEISHU_WEBHOOK_URL_UNINSTALL = "https://example.com/hook";

    const result = await sendFeishuTextMessage({
      channel: "ops_uninstall",
      message: "test",
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: "disabled",
      channel: "ops_uninstall",
    });
  });

  it("skips when webhook url is not configured", async () => {
    delete process.env.FEISHU_WEBHOOK_URL_UNINSTALL;

    const result = await sendFeishuTextMessage({
      channel: "ops_uninstall",
      message: "test",
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

    const result = await sendFeishuTextMessage({
      channel: "ops_subscription",
      message: "hello",
    });

    expect(result).toEqual({ ok: true, channel: "ops_subscription" });
  });

  it("returns ok false on non-zero feishu code", async () => {
    process.env.FEISHU_WEBHOOK_URL_SUBSCRIPTION = "https://example.com/hook";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 19001, msg: "error" }),
      }),
    );

    const result = await sendFeishuTextMessage({
      channel: "ops_subscription",
      message: "hello",
    });

    expect(result).toMatchObject({ ok: false, reason: "webhook_error" });
  });
});
