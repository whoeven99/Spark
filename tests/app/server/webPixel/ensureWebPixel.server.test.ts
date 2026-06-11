import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetWebPixelEnsureCacheForTest,
  buildDesiredWebPixelSettings,
  ensureWebPixel,
  resolvePixelIngestEndpoint,
} from "../../../../app/server/webPixel/ensureWebPixel.server";

const SHOP = "myshop.myshopify.com";
const ENDPOINT = "https://spark.example.com/api/pixel-ingest";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockAdmin(responses: Response[]) {
  const graphql = vi.fn();
  for (const response of responses) {
    graphql.mockResolvedValueOnce(response);
  }
  return { admin: { graphql }, graphql };
}

beforeEach(() => {
  __resetWebPixelEnsureCacheForTest();
  process.env.PIXEL_INGEST_ENDPOINT = ENDPOINT;
  delete process.env.SHOPIFY_APP_URL;
});

afterEach(() => {
  delete process.env.PIXEL_INGEST_ENDPOINT;
  delete process.env.SHOPIFY_APP_URL;
  vi.restoreAllMocks();
});

describe("resolvePixelIngestEndpoint", () => {
  it("prefers PIXEL_INGEST_ENDPOINT", () => {
    process.env.SHOPIFY_APP_URL = "https://other.example.com";
    expect(resolvePixelIngestEndpoint()).toBe(ENDPOINT);
  });

  it("falls back to SHOPIFY_APP_URL + /api/pixel-ingest", () => {
    delete process.env.PIXEL_INGEST_ENDPOINT;
    process.env.SHOPIFY_APP_URL = "https://tunnel.example.com/";
    expect(resolvePixelIngestEndpoint()).toBe(
      "https://tunnel.example.com/api/pixel-ingest",
    );
  });

  it("returns null when neither is set", () => {
    delete process.env.PIXEL_INGEST_ENDPOINT;
    expect(resolvePixelIngestEndpoint()).toBeNull();
  });
});

describe("ensureWebPixel", () => {
  it("creates pixel when query throws GraphqlQueryError (Shopify SDK)", async () => {
    const graphql = vi.fn();
    graphql.mockRejectedValueOnce(
      new Error("No web pixel was found for this app."),
    );
    graphql.mockResolvedValueOnce(
      jsonResponse({
        data: {
          webPixelCreate: {
            webPixel: { id: "gid://shopify/WebPixel/1" },
            userErrors: [],
          },
        },
      }),
    );

    const result = await ensureWebPixel({ graphql }, SHOP);

    expect(result).toEqual({ status: "created", id: "gid://shopify/WebPixel/1" });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("creates pixel when none exists (query returns not-found error)", async () => {
    const { admin, graphql } = mockAdmin([
      jsonResponse({
        data: { webPixel: null },
        errors: [{ message: "No web pixel was found" }],
      }),
      jsonResponse({
        data: {
          webPixelCreate: {
            webPixel: { id: "gid://shopify/WebPixel/1" },
            userErrors: [],
          },
        },
      }),
    ]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result).toEqual({ status: "created", id: "gid://shopify/WebPixel/1" });
    expect(graphql).toHaveBeenCalledTimes(2);
    const createVars = graphql.mock.calls[1][1] as {
      variables: { webPixel: { settings: Record<string, string> } };
    };
    expect(createVars.variables.webPixel.settings).toEqual(
      buildDesiredWebPixelSettings(SHOP, ENDPOINT),
    );
  });

  it("returns ok without mutation when settings already match", async () => {
    const settings = JSON.stringify(buildDesiredWebPixelSettings(SHOP, ENDPOINT));
    const { admin, graphql } = mockAdmin([
      jsonResponse({
        data: { webPixel: { id: "gid://shopify/WebPixel/1", settings } },
      }),
    ]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result).toEqual({ status: "ok" });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("updates pixel when ingestEndpoint drifts, preserving sampling/debug", async () => {
    const settings = JSON.stringify({
      shopName: SHOP,
      ingestEndpoint: "https://old-tunnel.example.com/api/pixel-ingest",
      sampling: "50",
      debug: "true",
    });
    const { admin, graphql } = mockAdmin([
      jsonResponse({
        data: { webPixel: { id: "gid://shopify/WebPixel/1", settings } },
      }),
      jsonResponse({
        data: {
          webPixelUpdate: {
            webPixel: { id: "gid://shopify/WebPixel/1" },
            userErrors: [],
          },
        },
      }),
    ]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result).toEqual({ status: "updated", id: "gid://shopify/WebPixel/1" });
    const updateVars = graphql.mock.calls[1][1] as {
      variables: { id: string; webPixel: { settings: Record<string, string> } };
    };
    expect(updateVars.variables.id).toBe("gid://shopify/WebPixel/1");
    expect(updateVars.variables.webPixel.settings).toEqual({
      shopName: SHOP,
      ingestEndpoint: ENDPOINT,
      sampling: "50",
      debug: "true",
    });
  });

  it("skips within TTL after a successful ensure", async () => {
    const settings = JSON.stringify(buildDesiredWebPixelSettings(SHOP, ENDPOINT));
    const { admin, graphql } = mockAdmin([
      jsonResponse({
        data: { webPixel: { id: "gid://shopify/WebPixel/1", settings } },
      }),
    ]);

    await ensureWebPixel(admin, SHOP);
    const second = await ensureWebPixel(admin, SHOP);

    expect(second).toEqual({ status: "skipped", reason: "ttl" });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("skips when no endpoint can be resolved", async () => {
    delete process.env.PIXEL_INGEST_ENDPOINT;
    const { admin, graphql } = mockAdmin([]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result).toEqual({ status: "skipped", reason: "missing-endpoint" });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("returns failed (and does not cache) when create has userErrors", async () => {
    const { admin } = mockAdmin([
      jsonResponse({ data: { webPixel: null } }),
      jsonResponse({
        data: {
          webPixelCreate: {
            webPixel: null,
            userErrors: [{ field: ["settings"], message: "invalid", code: "INVALID_SETTINGS" }],
          },
        },
      }),
    ]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result.status).toBe("failed");

    // 失败不写 TTL，下一次仍会重试
    const retry = mockAdmin([
      jsonResponse({
        data: {
          webPixel: {
            id: "gid://shopify/WebPixel/1",
            settings: JSON.stringify(buildDesiredWebPixelSettings(SHOP, ENDPOINT)),
          },
        },
      }),
    ]);
    const retryResult = await ensureWebPixel(retry.admin, SHOP);
    expect(retryResult).toEqual({ status: "ok" });
  });

  it("returns failed on unexpected GraphQL errors", async () => {
    const { admin } = mockAdmin([
      jsonResponse({ errors: [{ message: "Internal error" }] }),
    ]);

    const result = await ensureWebPixel(admin, SHOP);

    expect(result.status).toBe("failed");
  });
});
