import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

import { loginErrorMessage } from "../../../app/routes/auth.login/error.server";

const login = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  login: (...args: unknown[]) => login(...args),
}));

const { action, loader } = await import("../../../app/routes/auth.login/route");

async function expectRedirectToHome(
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    throw new Error("expected redirect response");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  }
}

describe("loginErrorMessage", () => {
  it("does not ask the merchant to type a shop domain", () => {
    const missing = loginErrorMessage({ shop: LoginErrorType.MissingShop });
    const invalid = loginErrorMessage({ shop: LoginErrorType.InvalidShop });

    expect(JSON.stringify(missing).toLowerCase()).not.toMatch(/enter/);
    expect(JSON.stringify(invalid).toLowerCase()).not.toMatch(/enter/);
    expect(JSON.stringify(missing).toLowerCase()).not.toMatch(/shop domain/);
    expect(JSON.stringify(invalid).toLowerCase()).not.toMatch(/shop domain/);
  });
});

describe("auth.login loader/action", () => {
  beforeEach(() => {
    login.mockReset();
  });

  it("redirects GET /auth/login without shop to the public landing page", async () => {
    const request = new Request("https://app.example.com/auth/login");
    await expectRedirectToHome(() => loader({ request } as never));
    expect(login).not.toHaveBeenCalled();
  });

  it("does not start OAuth from a shop domain posted in the form body", async () => {
    const request = new Request("https://app.example.com/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "shop=reviewer-shop.myshopify.com",
    });
    await expectRedirectToHome(() => action({ request } as never));
    expect(login).not.toHaveBeenCalled();
  });

  it("starts Shopify login when the shop query is present", async () => {
    login.mockResolvedValue({});
    const request = new Request(
      "https://app.example.com/auth/login?shop=reviewer-shop.myshopify.com",
    );

    await expect(loader({ request } as never)).resolves.toEqual({ errors: {} });
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(request);
  });

  it("redirects home when Shopify login reports a shop error", async () => {
    login.mockResolvedValue({ shop: LoginErrorType.InvalidShop });
    const request = new Request(
      "https://app.example.com/auth/login?shop=not-a-shop",
    );
    await expectRedirectToHome(() => loader({ request } as never));
    expect(login).toHaveBeenCalledTimes(1);
  });
});
