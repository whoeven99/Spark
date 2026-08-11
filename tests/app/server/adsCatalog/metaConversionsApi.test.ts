import { describe, expect, it } from "vitest";
import {
  buildMetaCapiUserData,
  hashMetaEmail,
  isMetaCapiTokenAuthError,
  MetaCapiTrackError,
  resolveClientIpFromHeaders,
} from "../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server";

describe("hashMetaEmail", () => {
  it("normalizes and hashes email", () => {
    const a = hashMetaEmail("Buyer@Example.COM");
    const b = hashMetaEmail("  buyer@example.com  ");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildMetaCapiUserData", () => {
  it("includes hashed email array and network identifiers", () => {
    expect(
      buildMetaCapiUserData({
        email: "buyer@example.com",
        clientIpAddress: "203.0.113.10",
        clientUserAgent: "Mozilla/5.0",
      }),
    ).toEqual({
      em: [hashMetaEmail("buyer@example.com")],
      client_ip_address: "203.0.113.10",
      client_user_agent: "Mozilla/5.0",
    });
  });
});

describe("resolveClientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for address", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "cf-connecting-ip": "198.51.100.20",
    });
    expect(resolveClientIpFromHeaders(headers)).toBe("203.0.113.10");
  });
});

describe("isMetaCapiTokenAuthError", () => {
  it("detects OAuth token errors from structured track errors", () => {
    expect(
      isMetaCapiTokenAuthError(
        new MetaCapiTrackError("expired", { httpStatus: 400, errorCode: 190, errorType: "OAuthException" }),
      ),
    ).toBe(true);
    expect(
      isMetaCapiTokenAuthError(new MetaCapiTrackError("unauthorized", { httpStatus: 401 })),
    ).toBe(true);
    expect(
      isMetaCapiTokenAuthError(new MetaCapiTrackError("other", { httpStatus: 500, errorCode: 100 })),
    ).toBe(false);
  });
});
