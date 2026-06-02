import { describe, expect, it } from "vitest";
import { buildSessionTokenBounceParamRedirect } from "../../../../app/server/shopify/sessionTokenBounce.server";

describe("buildSessionTokenBounceParamRedirect", () => {
  it("recovers embedded params from shopify-reload on billing bounce URLs", () => {
    const request = new Request(
      "https://app.example.com/auth/session-token?billing_return=1&charge_id=2577989655&shopify-reload=https%3A%2F%2Fapp.example.com%2Fapp%2Fbilling%3Fshop%3Dciwishop.myshopify.com%26billing_return%3D1%26embedded%3D1%26host%3DY2l3aXNob3AubXlzaG9waWZ5LmNvbS9hZG1pbg%253D%253D%26charge_id%3D2577989655",
    );

    const redirectUrl = buildSessionTokenBounceParamRedirect(request);

    expect(redirectUrl).not.toBeNull();
    const parsed = new URL(redirectUrl!, "https://app.example.com");
    expect(parsed.pathname).toBe("/auth/session-token");
    expect(parsed.searchParams.get("shop")).toBe("ciwishop.myshopify.com");
    expect(parsed.searchParams.get("embedded")).toBe("1");
    expect(parsed.searchParams.get("host")).toBe(
      "Y2l3aXNob3AubXlzaG9waWZ5LmNvbS9hZG1pbg==",
    );
    expect(parsed.searchParams.get("billing_return")).toBe("1");
    expect(parsed.searchParams.get("charge_id")).toBe("2577989655");
  });

  it("does not redirect when the bounce URL already has embedded params", () => {
    const request = new Request(
      "https://app.example.com/auth/session-token?shop=ciwishop.myshopify.com&host=encoded-host&embedded=1&shopify-reload=https%3A%2F%2Fapp.example.com%2Fapp%2Fbilling%3Fshop%3Dciwishop.myshopify.com%26host%3Dencoded-host%26embedded%3D1",
    );

    expect(buildSessionTokenBounceParamRedirect(request)).toBeNull();
  });
});
