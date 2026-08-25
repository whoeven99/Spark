import { describe, expect, it } from "vitest";
import { buildShopifyAdminHostParam } from "../../../../app/server/billing/buildBillingReturnUrl.server";
import {
  buildEmbeddedHomeRecoveryPath,
  isEmbeddedAdminEntry,
  resolveShopQueryFromRequest,
  shopDomainFromHostParam,
  shouldRecoverEmbeddedHome,
} from "../../../../app/server/shopify/embeddedEntry.server";

describe("shopDomainFromHostParam", () => {
  it("decodes shop domain from host param", () => {
    const host = buildShopifyAdminHostParam("demo-store.myshopify.com");
    expect(shopDomainFromHostParam(host)).toBe("demo-store.myshopify.com");
  });

  it("returns null for invalid base64", () => {
    expect(shopDomainFromHostParam("not-valid!!!")).toBeNull();
  });

  it("handles + decoded as space by URLSearchParams", () => {
    // base64 中的 + 被 URLSearchParams 解释为空格
    const host = buildShopifyAdminHostParam("test-shop.myshopify.com");
    const hostWithSpaces = host.replace(/\+/g, " ");
    expect(shopDomainFromHostParam(hostWithSpaces)).toBe("test-shop.myshopify.com");
  });
});

describe("resolveShopQueryFromRequest", () => {
  it("prefers shop query over host", () => {
    const host = buildShopifyAdminHostParam("other.myshopify.com");
    const request = new Request(
      `https://app.example/?shop=primary.myshopify.com&host=${encodeURIComponent(host)}`,
    );
    expect(resolveShopQueryFromRequest(request)).toBe("primary.myshopify.com");
  });

  it("falls back to host when shop is missing", () => {
    const host = buildShopifyAdminHostParam("fallback.myshopify.com");
    const request = new Request(`https://app.example/?host=${encodeURIComponent(host)}`);
    expect(resolveShopQueryFromRequest(request)).toBe("fallback.myshopify.com");
  });
});

describe("isEmbeddedAdminEntry", () => {
  it("detects embedded=1", () => {
    const request = new Request("https://app.example/?embedded=1");
    expect(isEmbeddedAdminEntry(request)).toBe(true);
  });
});

describe("shouldRecoverEmbeddedHome", () => {
  it("detects Admin iframe document request without shop query", () => {
    const request = new Request("https://app.example/", {
      headers: { "sec-fetch-dest": "iframe" },
    });
    expect(shouldRecoverEmbeddedHome(request)).toBe(true);
  });

  it("ignores same-origin /app referer so API fetches are not redirected", () => {
    const request = new Request("https://app.example/api/unified-tasks", {
      headers: { referer: "https://app.example/app/today" },
    });
    expect(shouldRecoverEmbeddedHome(request)).toBe(false);
  });

  it("ignores React Router data fetches (sec-fetch-dest=empty)", () => {
    const request = new Request("https://app.example/app/settings", {
      headers: {
        "sec-fetch-dest": "empty",
        referer: "https://app.example/app",
      },
    });
    expect(shouldRecoverEmbeddedHome(request)).toBe(false);
  });

  it("detects document navigation from admin.shopify.com", () => {
    const request = new Request("https://app.example/app/settings", {
      headers: {
        "sec-fetch-dest": "document",
        referer: "https://admin.shopify.com/store/demo/apps/aiassistant-test",
      },
    });
    expect(shouldRecoverEmbeddedHome(request)).toBe(true);
  });

  it("ignores top-level visits with no iframe or Admin referer", () => {
    const request = new Request("https://app.example/");
    expect(shouldRecoverEmbeddedHome(request)).toBe(false);
  });
});

describe("buildEmbeddedHomeRecoveryPath", () => {
  it("sends iframe home to /app with embedded=1", () => {
    const request = new Request("https://app.example/");
    expect(buildEmbeddedHomeRecoveryPath("/app", request)).toBe("/app?embedded=1");
  });

  it("keeps Admin nav path such as /app/settings", () => {
    const request = new Request("https://app.example/app/settings");
    expect(buildEmbeddedHomeRecoveryPath("/app/settings", request)).toBe(
      "/app/settings?embedded=1",
    );
  });
});
