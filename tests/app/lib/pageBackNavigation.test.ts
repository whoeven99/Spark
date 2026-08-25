import { describe, expect, it } from "vitest";
import { resolveBackDestination } from "../../../app/lib/pageBackNavigation";

describe("resolveBackDestination", () => {
  it("replaces the current entry when returnTo is set", () => {
    expect(
      resolveBackDestination({
        fallbackPath: "/app",
        locationSearch: "?country=US",
        preserveSearch: true,
        returnTo: "/app/today",
      }),
    ).toEqual({ to: "/app/today", replace: true });
  });

  it("trims returnTo and ignores empty values", () => {
    expect(
      resolveBackDestination({
        fallbackPath: "/app",
        returnTo: "  /app/today?country=US  ",
      }),
    ).toEqual({ to: "/app/today?country=US", replace: true });

    expect(
      resolveBackDestination({
        fallbackPath: "/app",
        returnTo: "   ",
      }),
    ).toEqual({ to: "/app", replace: false });
  });

  it("goes to fallbackPath instead of history.back", () => {
    expect(
      resolveBackDestination({
        fallbackPath: "/app",
        locationSearch: "?country=US",
      }),
    ).toEqual({ to: "/app", replace: false });
  });

  it("appends current search only when preserveSearch is on", () => {
    expect(
      resolveBackDestination({
        fallbackPath: "/app/settings/connections/google",
        locationSearch: "?shop=demo.myshopify.com&host=abc",
        preserveSearch: true,
      }),
    ).toEqual({
      to: "/app/settings/connections/google?shop=demo.myshopify.com&host=abc",
      replace: false,
    });
  });

  it("merges search onto a fallbackPath that already has a query", () => {
    expect(
      resolveBackDestination({
        fallbackPath: "/app/health-monitor?view=overview",
        locationSearch: "?monitor=conversion-health",
        preserveSearch: true,
      }),
    ).toEqual({
      to: "/app/health-monitor?view=overview&monitor=conversion-health",
      replace: false,
    });
  });
});
