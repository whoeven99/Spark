import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    admin: authenticateAdmin,
  },
}));

const { loader } = await import("../../../app/routes/_index/route");

describe("_index loader", () => {
  beforeEach(() => {
    authenticateAdmin.mockReset();
  });

  it("returns the public landing payload without a shop-domain login form flag", async () => {
    const request = new Request("https://app.example.com/");
    const data = await loader({ request } as never);

    expect(data).toEqual({ home: "/app", locale: "en" });
    expect(data).not.toHaveProperty("showForm");
    expect(authenticateAdmin).not.toHaveBeenCalled();
  });

  it("redirects Shopify-initiated installs with shop into the embedded app", async () => {
    const request = new Request(
      "https://app.example.com/?shop=reviewer-shop.myshopify.com",
    );

    try {
      await loader({ request } as never);
      throw new Error("expected redirect response");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("/app");
      expect(response.headers.get("Location")).toContain(
        "shop=reviewer-shop.myshopify.com",
      );
    }
  });
});
