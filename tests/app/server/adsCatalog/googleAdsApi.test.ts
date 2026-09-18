import { describe, expect, it, vi } from "vitest";
import {
  classifyGoogleAdsError,
  formatGoogleAdsUserError,
  parseGoogleAdsError,
  resolveLoginCustomerId,
} from "~/server/adsCatalog/googleAdsApi.server";

describe("parseGoogleAdsError", () => {
  it("prefers nested GoogleAdsFailure message over top-level INVALID_ARGUMENT", () => {
    const body = JSON.stringify([
      {
        error: {
          code: 400,
          message: "Request contains an invalid argument.",
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.ads.googleads.v24.errors.GoogleAdsFailure",
              errors: [
                {
                  errorCode: { queryError: "REQUESTED_METRICS_FOR_MANAGER" },
                  message:
                    "Metrics cannot be requested for a manager account. To retrieve metrics, issue separate requests against each client account under the manager account.",
                },
              ],
            },
          ],
        },
      },
    ]);

    expect(parseGoogleAdsError(body, 400)).toContain("manager account");
    expect(parseGoogleAdsError(body, 400)).not.toBe("Request contains an invalid argument.");
  });

  it("appends authorizationError when top-level permission message lacks details text", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "The caller does not have permission",
        status: "PERMISSION_DENIED",
        details: [
          {
            errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }],
          },
        ],
      },
    });
    expect(parseGoogleAdsError(body, 403)).toContain("USER_PERMISSION_DENIED");
  });

  it("falls back to top-level message when details are missing", () => {
    const body = JSON.stringify({
      error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" },
    });
    expect(parseGoogleAdsError(body, 403)).toBe("The caller does not have permission");
  });

  it("falls back to HTTP status for empty bodies", () => {
    expect(parseGoogleAdsError("", 500)).toBe("HTTP 500");
  });
});

describe("formatGoogleAdsUserError", () => {
  it("maps permission errors to actionable Chinese guidance", () => {
    expect(classifyGoogleAdsError("The caller does not have permission")).toBe("permission");
    expect(formatGoogleAdsUserError("User doesn't have permission to access customer. login-customer-id")).toContain(
      "重新授权",
    );
  });

  it("maps developer token test-only errors", () => {
    expect(
      classifyGoogleAdsError("The developer token is only approved for use with test accounts."),
    ).toBe("developer_token");
  });
});

describe("resolveLoginCustomerId", () => {
  it("caps login-customer-id probe attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveLoginCustomerId({
      accessToken: "access",
      developerToken: "dev",
      customerId: "1111111111",
      accessibleCustomerIds: ["2222222222", "3333333333", "4444444444", "5555555555", "6666666666"],
    });

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
    expect(result).toBe("1111111111");
    vi.unstubAllGlobals();
  });

  it("probes preferred login-customer-id before target customer id", async () => {
    const probes: string[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: { headers?: Record<string, string> }) => {
      const login = opts?.headers?.["login-customer-id"];
      if (login) probes.push(login);
      return Promise.resolve({
        ok: login === "2222222222",
        text: async () => "",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveLoginCustomerId({
      accessToken: "access",
      developerToken: "dev",
      customerId: "1111111111",
      preferredLoginCustomerId: "2222222222",
      accessibleCustomerIds: ["3333333333"],
    });

    expect(result).toBe("2222222222");
    expect(probes[0]).toBe("2222222222");
    vi.unstubAllGlobals();
  });
});
