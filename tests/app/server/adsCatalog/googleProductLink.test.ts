import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getGoogleMerchantCredential: vi.fn().mockResolvedValue({
    accessToken: "merchant-token",
    merchantId: "999",
  }),
}));
vi.mock("../../../../app/server/adsCatalog/googleAdsToken.server", () => ({
  prepareGoogleAdsApiAuth: vi.fn().mockResolvedValue({
    accessToken: "ads-token",
    customerId: "123-456-7890",
    loginCustomerId: "1234567890",
  }),
}));
vi.mock("../../../../app/server/adsCatalog/googleOAuth.server", () => ({
  getGoogleAdsDeveloperToken: vi.fn().mockReturnValue("developer-token"),
}));

import {
  ensureGoogleProductLink,
  getGoogleProductLinkStatus,
} from "../../../../app/server/adsCatalog/googleProductLink.server";

describe("Google Product Link 状态机", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("已关联时幂等返回，不发创建请求", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            results: [
              {
                productLink: {
                  type: "MERCHANT_CENTER",
                  merchantCenter: { merchantCenterId: "999" },
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(Response.json([{ results: [] }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureGoogleProductLink("shop.myshopify.com")).resolves.toMatchObject({
      state: "linked",
      merchantId: "999",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("直接创建不允许时回落到 invitation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ results: [] }]))
      .mockResolvedValueOnce(Response.json([{ results: [] }]))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: "Request contains an invalid argument.",
              details: [{ errors: [{ message: "CREATION_NOT_PERMITTED" }] }],
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ resourceName: "customers/123/invitations/1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureGoogleProductLink("shop.myshopify.com")).resolves.toMatchObject({
      state: "pending",
      invitationStatus: "REQUESTED",
    });
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      "productLinkInvitations:create",
    );
  });

  it("查询 invitation 时返回 pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ results: [] }]))
      .mockResolvedValueOnce(
        Response.json([
          {
            results: [
              {
                productLinkInvitation: {
                  status: "REQUESTED",
                  merchantCenter: { merchantCenterId: "999" },
                },
              },
            ],
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getGoogleProductLinkStatus("shop.myshopify.com")).resolves.toMatchObject({
      state: "pending",
    });
  });
});
