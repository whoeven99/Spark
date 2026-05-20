import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/profile/shopifyProfileProvider.server", () => ({
  fetchProfileFromShopify: vi.fn(),
}));

vi.mock("../../../../app/server/profile/profileService.server", () => ({
  readSessionFields: vi.fn(),
  patchProfileByShop: vi.fn(),
  patchBySessionId: vi.fn(),
}));

describe("syncProfile", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips profile write when GraphQL returns null", async () => {
    const { fetchProfileFromShopify } = await import(
      "../../../../app/server/profile/shopifyProfileProvider.server"
    );
    const { readSessionFields, patchProfileByShop, patchBySessionId } =
      await import("../../../../app/server/profile/profileService.server");
    const { syncProfile } = await import(
      "../../../../app/server/profile/profileSyncService.server"
    );

    vi.mocked(fetchProfileFromShopify).mockResolvedValue(null);
    vi.mocked(readSessionFields).mockResolvedValue({
      firstName: "John",
      lastName: "Smith",
      email: "a@test.com",
      accessToken: "tok",
      refreshToken: null,
      refreshTokenExpires: null,
    });

    const admin = { graphql: vi.fn() };
    const result = await syncProfile({
      shop: "demo.myshopify.com",
      sessionId: "offline_demo",
      admin,
    });

    expect(result).toBeNull();
    expect(patchProfileByShop).not.toHaveBeenCalled();
    expect(patchBySessionId).not.toHaveBeenCalled();
  });

  it("patches only changed profile fields", async () => {
    const { fetchProfileFromShopify } = await import(
      "../../../../app/server/profile/shopifyProfileProvider.server"
    );
    const { readSessionFields, patchProfileByShop } = await import(
      "../../../../app/server/profile/profileService.server"
    );
    const { syncProfile } = await import(
      "../../../../app/server/profile/profileSyncService.server"
    );

    vi.mocked(fetchProfileFromShopify).mockResolvedValue({
      firstName: "John",
      lastName: "Tom",
      email: "a@test.com",
    });
    vi.mocked(readSessionFields).mockResolvedValue({
      firstName: "John",
      lastName: "Smith",
      email: "a@test.com",
      accessToken: "tok",
      refreshToken: null,
      refreshTokenExpires: null,
    });
    vi.mocked(patchProfileByShop).mockResolvedValue(1);

    const admin = { graphql: vi.fn() };
    await syncProfile({
      shop: "demo.myshopify.com",
      sessionId: "offline_demo",
      admin,
    });

    expect(patchProfileByShop).toHaveBeenCalledWith("demo.myshopify.com", {
      lastName: "Tom",
    });
  });

  it("patches accessToken on current session only when changed", async () => {
    const { fetchProfileFromShopify } = await import(
      "../../../../app/server/profile/shopifyProfileProvider.server"
    );
    const { readSessionFields, patchProfileByShop, patchBySessionId } =
      await import("../../../../app/server/profile/profileService.server");
    const { syncProfile } = await import(
      "../../../../app/server/profile/profileSyncService.server"
    );

    vi.mocked(fetchProfileFromShopify).mockResolvedValue({
      firstName: "John",
      lastName: "Smith",
      email: "a@test.com",
    });
    vi.mocked(readSessionFields).mockResolvedValue({
      firstName: "John",
      lastName: "Smith",
      email: "a@test.com",
      accessToken: "old",
      refreshToken: null,
      refreshTokenExpires: null,
    });
    vi.mocked(patchProfileByShop).mockResolvedValue(0);

    const admin = { graphql: vi.fn() };
    await syncProfile({
      shop: "demo.myshopify.com",
      sessionId: "sess-1",
      admin,
      sessionFromAuth: { accessToken: "new" },
    });

    expect(patchBySessionId).toHaveBeenCalledWith("sess-1", {
      accessToken: "new",
    });
  });
});
