import { afterEach, describe, expect, it } from "vitest";
import {
  META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT,
  collectMetaCatalogIds,
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

  it("载荷无法解析时仍返回 200，避免 Meta 重试风暴", async () => {
    const request = new Request("https://example.com/webhooks/meta/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const response = await handleMetaCatalogWebhookEvent(request);
    expect(response.status).toBe(200);
  });
});

describe("collectMetaCatalogIds", () => {
  it("从 product_catalog 信封的 entry.id 取 catalog id", () => {
    expect(
      collectMetaCatalogIds({
        object: "product_catalog",
        entry: [{ id: "1234567890", time: 1700000000, changes: [] }],
      }),
    ).toEqual(["1234567890"]);
  });

  it("兼容 changes[].value 里携带的 catalog id", () => {
    expect(
      collectMetaCatalogIds({
        entry: [
          {
            changes: [
              { field: "product_items", value: { catalog_id: "cat-a" } },
              { field: "product_items", value: { product_catalog_id: 99 } },
            ],
          },
        ],
      }),
    ).toEqual(["cat-a", "99"]);
  });

  it("同一 catalog 出现多次时去重", () => {
    expect(
      collectMetaCatalogIds({
        entry: [
          { id: "cat-a", changes: [{ value: { catalog_id: "cat-a" } }] },
          { id: "cat-a" },
        ],
      }),
    ).toEqual(["cat-a"]);
  });

  it("对畸形载荷返回空数组而不抛错", () => {
    expect(collectMetaCatalogIds(null)).toEqual([]);
    expect(collectMetaCatalogIds({})).toEqual([]);
    expect(collectMetaCatalogIds({ entry: "nope" })).toEqual([]);
    expect(collectMetaCatalogIds({ entry: [null, 42, { id: "" }] })).toEqual([]);
    expect(collectMetaCatalogIds({ entry: [{ changes: [{ value: null }] }] })).toEqual([]);
  });
});
