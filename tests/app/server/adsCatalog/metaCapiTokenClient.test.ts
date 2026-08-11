import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMetaAppsecretProof,
  fetchMetaPixelCapiAccessToken,
} from "../../../../app/server/adsCatalog/clients/metaCapiTokenClient.server";

describe("buildMetaAppsecretProof", () => {
  it("hashes access token with app secret", () => {
    const proof = buildMetaAppsecretProof("user-token", "app-secret");
    const expected = createHmac("sha256", "app-secret").update("user-token").digest("hex");
    expect(proof).toBe(expected);
  });
});

describe("fetchMetaPixelCapiAccessToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns business manager access token when FBE path succeeds", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "bm-capi-token" }), { status: 200 }),
    );

    const token = await fetchMetaPixelCapiAccessToken({
      shop: "demo.myshopify.com",
      pixelId: "123456",
      businessId: "biz_1",
      oauthAccessToken: "oauth-token",
      appId: "app-id",
      appSecret: "app-secret",
    });

    expect(token).toBe("bm-capi-token");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to system user token generation", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "fbe unavailable" } }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "su_1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "system-capi-token" }), { status: 200 }),
      );

    const token = await fetchMetaPixelCapiAccessToken({
      shop: "demo.myshopify.com",
      pixelId: "123456",
      businessId: "biz_1",
      oauthAccessToken: "oauth-token",
      appId: "app-id",
      appSecret: "app-secret",
    });

    expect(token).toBe("system-capi-token");
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
