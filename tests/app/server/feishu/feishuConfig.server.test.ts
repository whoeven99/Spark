import { afterEach, describe, expect, it } from "vitest";
import {
  isFeishuChannelReady,
  isFeishuEnabled,
  resolveFeishuWebhookUrl,
} from "../../../../app/server/feishu/feishuConfig.server";

describe("feishuConfig", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("isFeishuEnabled defaults to true", () => {
    delete process.env.FEISHU_ENABLED;
    expect(isFeishuEnabled()).toBe(true);
  });

  it("isFeishuEnabled respects false", () => {
    process.env.FEISHU_ENABLED = "false";
    expect(isFeishuEnabled()).toBe(false);
  });

  it("resolveFeishuWebhookUrl returns null when unset", () => {
    delete process.env.FEISHU_WEBHOOK_URL_UNINSTALL;
    expect(resolveFeishuWebhookUrl("ops_uninstall")).toBeNull();
  });

  it("resolveFeishuWebhookUrl returns trimmed url", () => {
    process.env.FEISHU_WEBHOOK_URL_SUBSCRIPTION =
      "  https://open.feishu.cn/open-apis/bot/v2/hook/test  ";
    expect(resolveFeishuWebhookUrl("ops_subscription")).toBe(
      "https://open.feishu.cn/open-apis/bot/v2/hook/test",
    );
  });

  it("isFeishuChannelReady is false when disabled", () => {
    process.env.FEISHU_ENABLED = "false";
    process.env.FEISHU_WEBHOOK_URL_UNINSTALL = "https://example.com/hook";
    expect(isFeishuChannelReady("ops_uninstall")).toBe(false);
  });

  it("isFeishuChannelReady is true when enabled and url set", () => {
    process.env.FEISHU_ENABLED = "true";
    process.env.FEISHU_WEBHOOK_URL_UNINSTALL = "https://example.com/hook";
    expect(isFeishuChannelReady("ops_uninstall")).toBe(true);
  });
});
