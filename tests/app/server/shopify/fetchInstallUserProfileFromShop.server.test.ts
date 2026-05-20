import { describe, expect, it } from "vitest";
import { fetchInstallUserProfileFromShop } from "../../../../app/server/shopify/fetchInstallUserProfileFromShop.server";

function mockAdmin(body: unknown) {
  return {
    graphql: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  };
}

describe("fetchInstallUserProfileFromShop", () => {
  it("maps shopOwnerName and shop email", async () => {
    const profile = await fetchInstallUserProfileFromShop(
      mockAdmin({
        data: {
          shop: {
            email: "owner@example.com",
            shopOwnerName: "Wei Zhang",
          },
        },
      }),
    );
    expect(profile).toEqual({
      firstName: "Wei",
      lastName: "Zhang",
      email: "owner@example.com",
    });
  });

  it("returns null on GraphQL errors", async () => {
    const profile = await fetchInstallUserProfileFromShop(
      mockAdmin({
        errors: [{ message: "Access denied for accountOwner field." }],
      }),
    );
    expect(profile).toBeNull();
  });
});
