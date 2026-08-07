import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  getMetaDataDeletionCallbackUrl,
  handleMetaDataDeletionRequest,
  handleMetaDataDeletionStatus,
  META_DATA_DELETION_PATH,
  parseMetaSignedRequest,
} from "../../../../app/server/adsCatalog/metaDataDeletion.server";

function buildSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest("base64url");
  return `${sig}.${encodedPayload}`;
}

describe("metaDataDeletion", () => {
  const appSecret = "test-meta-app-secret";

  afterEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.SHOPIFY_APP_URL;
  });

  it("根据 SHOPIFY_APP_URL 生成 callback URL", () => {
    process.env.SHOPIFY_APP_URL = "https://aiassistant-wi7b.onrender.com/";
    expect(getMetaDataDeletionCallbackUrl()).toBe(
      "https://aiassistant-wi7b.onrender.com/meta/data-deletion",
    );
  });

  it("解析并校验 signed_request", () => {
    const payload = {
      algorithm: "HMAC-SHA256",
      issued_at: 1291836800,
      user_id: "218471",
    };
    const signedRequest = buildSignedRequest(payload, appSecret);
    const parsed = parseMetaSignedRequest(signedRequest, appSecret);
    expect(parsed?.user_id).toBe("218471");
  });

  it("signed_request 校验失败时返回 null", () => {
    const signedRequest = buildSignedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, appSecret);
    expect(parseMetaSignedRequest(signedRequest, "wrong-secret")).toBeNull();
  });

  it("POST 回调返回 url 与 confirmation_code", async () => {
    process.env.META_APP_ID = "test-app-id";
    process.env.META_APP_SECRET = appSecret;
    process.env.SHOPIFY_APP_URL = "https://aiassistant-wi7b.onrender.com";

    const signedRequest = buildSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "218471" },
      appSecret,
    );

    const request = new Request(`https://example.com${META_DATA_DELETION_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });

    const response = await handleMetaDataDeletionRequest(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toMatch(/^[a-zA-Z0-9]+$/);
    expect(body.url).toContain("/meta/data-deletion?code=");
    expect(body.url).toContain(body.confirmation_code);
  });

  it("GET 状态页可查询 confirmation code", () => {
    const response = handleMetaDataDeletionStatus(
      new Request("https://example.com/meta/data-deletion?code=abc123"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });
});
