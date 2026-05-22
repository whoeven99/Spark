import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPartnerGraphqlUrl,
  fetchUninstallFeedbackFromPartner,
  normalizeShopDomain,
  resolvePartnerAppGid,
} from "../../../../app/server/partner/fetchUninstallFeedbackFromPartner.server";

describe("normalizeShopDomain", () => {
  it("normalizes bare shop name", () => {
    expect(normalizeShopDomain("My-Store")).toBe("my-store.myshopify.com");
  });

  it("keeps full myshopify domain", () => {
    expect(normalizeShopDomain("my-store.myshopify.com")).toBe(
      "my-store.myshopify.com",
    );
  });
});

describe("buildPartnerGraphqlUrl", () => {
  it("includes organization id in path", () => {
    expect(buildPartnerGraphqlUrl("1234567")).toBe(
      "https://partners.shopify.com/1234567/api/2026-07/graphql.json",
    );
  });
});

describe("resolvePartnerAppGid", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns null when not configured", () => {
    delete process.env.SHOPIFY_PARTNER_APP_ID;
    expect(resolvePartnerAppGid()).toBeNull();
  });

  it("wraps numeric id as gid", () => {
    process.env.SHOPIFY_PARTNER_APP_ID = "361747677185";
    expect(resolvePartnerAppGid()).toBe("gid://partners/App/361747677185");
  });

  it("keeps full gid unchanged", () => {
    process.env.SHOPIFY_PARTNER_APP_ID = "gid://partners/App/99";
    expect(resolvePartnerAppGid()).toBe("gid://partners/App/99");
  });
});

describe("fetchUninstallFeedbackFromPartner", () => {
  const env = process.env;

  beforeEach(() => {
    process.env.SHOPIFY_PARTNER_API_TOKEN = "test-partner-token";
    process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = "1234567";
    process.env.SHOPIFY_PARTNER_APP_ID = "gid://partners/App/999";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("returns null when token is not configured", async () => {
    delete process.env.SHOPIFY_PARTNER_API_TOKEN;

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });

  it("returns null when organization id is not configured", async () => {
    delete process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });

  it("returns null when app id is not configured", async () => {
    delete process.env.SHOPIFY_PARTNER_APP_ID;

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });

  it("returns latest matching uninstall feedback for shop", async () => {
    const payload = {
      data: {
        app: {
          id: "gid://partners/App/999",
          name: "spark_zz",
          events: {
            edges: [
              {
                node: {
                  reason: "Too expensive",
                  description: "Old feedback",
                  occurredAt: "2026-05-20T08:00:00.000Z",
                  shop: { myshopifyDomain: "demo.myshopify.com" },
                },
              },
              {
                node: {
                  reason: "Not using app now",
                  description: "Latest note",
                  occurredAt: "2026-05-20T10:00:00.000Z",
                  shop: { myshopifyDomain: "demo.myshopify.com" },
                },
              },
              {
                node: {
                  reason: "Other",
                  description: "Other shop",
                  occurredAt: "2026-05-20T11:00:00.000Z",
                  shop: { myshopifyDomain: "other.myshopify.com" },
                },
              },
            ],
          },
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toEqual({
      reason: "Not using app now",
      description: "Latest note",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      variables: { appId: string; first: number };
    };
    expect(body.variables).toEqual({
      appId: "gid://partners/App/999",
      first: 20,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://partners.shopify.com/1234567/api/2026-07/graphql.json",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns null when app is not found in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ data: { app: null } }),
      }),
    );

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });

  it("returns null on graphql errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ errors: [{ message: "Unauthorized" }] }),
      }),
    );

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });

  it("returns null when response is not json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "<!DOCTYPE html><html></html>",
      }),
    );

    const result = await fetchUninstallFeedbackFromPartner(
      "demo.myshopify.com",
    );

    expect(result).toBeNull();
  });
});
