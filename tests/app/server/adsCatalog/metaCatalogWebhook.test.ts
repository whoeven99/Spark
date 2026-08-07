import { afterEach, describe, expect, it } from "vitest";
import {
  META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT,
  getMetaCatalogWebhookCallbackUrl,
  getMetaCatalogWebhookVerifyToken,
  handleMetaCatalogWebhookEvent,
  verifyMetaCatalogWebhookSubscription,
} from "../../../../app/server/adsCatalog/metaCatalogWebhook.server";

describe("metaCatalogWebhook", () => {
  afterEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    delete process.env.SHOPIFY_APP_URL;
  });

  it("默认 verify token 为 123456", () => {
    expect(getMetaCatalogWebhookVerifyToken()).toBe("123456");
    expect(META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT).toBe("123456");
  });

  it("环境变量覆盖默认 verify token", () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "custom-token";
    expect(getMetaCatalogWebhookVerifyToken()).toBe("custom-token");
  });

  it("根据 SHOPIFY_APP_URL 生成 callback URL", () => {
    process.env.SHOPIFY_APP_URL = "https://assistant-w7b.onrender.com/";
    expect(getMetaCatalogWebhookCallbackUrl()).toBe(
      "https://assistant-w7b.onrender.com/webhooks/meta/catalog",
    );
  });

  it("校验通过时原样返回 hub.challenge", async () => {
    const request = new Request(
      "https://example.com/webhooks/meta/catalog?hub.mode=subscribe&hub.verify_token=123456&hub.challenge=1158201444",
    );
    const response = verifyMetaCatalogWebhookSubscription(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("1158201444");
  });

  it("verify token 不匹配时返回 403", () => {
    const request = new Request(
      "https://example.com/webhooks/meta/catalog?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1",
    );
    expect(verifyMetaCatalogWebhookSubscription(request).status).toBe(403);
  });

  it("POST 事件返回 200", async () => {
    const request = new Request("https://example.com/webhooks/meta/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "catalog", entry: [] }),
    });
    const response = await handleMetaCatalogWebhookEvent(request);
    expect(response.status).toBe(200);
  });
});
