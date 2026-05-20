import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../../app/server/shopify/fetchInstallUserProfileFromShop.server",
  () => ({
    fetchInstallUserProfileFromShop: vi.fn(),
  }),
);

describe("fetchProfileFromShopify", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("only fetches shop owner profile", async () => {
    const { fetchInstallUserProfileFromShop } = await import(
      "../../../../app/server/shopify/fetchInstallUserProfileFromShop.server"
    );
    const { fetchProfileFromShopify } = await import(
      "../../../../app/server/profile/shopifyProfileProvider.server"
    );

    vi.mocked(fetchInstallUserProfileFromShop).mockResolvedValue({
      firstName: "Wei",
      lastName: "Zhang",
      email: "owner@example.com",
    });

    const admin = { graphql: vi.fn() };
    const profile = await fetchProfileFromShopify(admin);

    expect(fetchInstallUserProfileFromShop).toHaveBeenCalledTimes(1);
    expect(fetchInstallUserProfileFromShop).toHaveBeenCalledWith(admin);
    expect(profile).toEqual({
      firstName: "Wei",
      lastName: "Zhang",
      email: "owner@example.com",
    });
  });
});
