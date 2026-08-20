import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    admin: authenticateAdmin,
  },
}));

const { loader } = await import("../../../app/routes/auth.$");

describe("auth.$ loader", () => {
  beforeEach(() => {
    authenticateAdmin.mockReset();
  });

  it("returns null after authenticate.admin so Shopify manages auth redirects", async () => {
    authenticateAdmin.mockResolvedValue({
      admin: {},
      session: {},
    });

    const request = new Request(
      "https://app.example.com/auth/callback?shop=test-shop.myshopify.com&host=encoded&embedded=1&id_token=test-token",
    );

    await expect(loader({ request } as never)).resolves.toBeNull();
    expect(authenticateAdmin).toHaveBeenCalledTimes(1);
    expect(authenticateAdmin).toHaveBeenCalledWith(request);
  });

  it("recovers missing embedded params on session-token bounce before authenticating", async () => {
    const request = new Request(
      "https://app.example.com/auth/session-token?billing_return=1&charge_id=2577989655&shopify-reload=https%3A%2F%2Fapp.example.com%2Fapp%2Fbilling%3Fshop%3Dciwishop.myshopify.com%26billing_return%3D1%26embedded%3D1%26host%3DY2l3aXNob3AubXlzaG9waWZ5LmNvbS9hZG1pbg%253D%253D%26charge_id%3D2577989655",
    );

    try {
      await loader({ request } as never);
      throw new Error("expected redirect response");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("/auth/session-token?");
      expect(response.headers.get("Location")).toContain("shop=ciwishop.myshopify.com");
      expect(response.headers.get("Location")).toContain("embedded=1");
      expect(response.headers.get("Location")).toContain(
        "host=Y2l3aXNob3AubXlzaG9waWZ5LmNvbS9hZG1pbg%3D%3D",
      );
    }

    expect(authenticateAdmin).not.toHaveBeenCalled();
  });
});
