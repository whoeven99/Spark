import { describe, expect, it } from "vitest";
import {
  imageUrlToHost,
  resolveAgentRunStatus,
  sanitizeHumanInput,
  truncateText,
} from "./sanitize.server";

describe("sanitizeHumanInput", () => {
  it("truncates long text", () => {
    const long = "a".repeat(600);
    const out = sanitizeHumanInput(long);
    expect(out).toBeDefined();
    expect(out!.length).toBeLessThanOrEqual(501);
    expect(out!.endsWith("…")).toBe(true);
  });

  it("returns undefined for empty", () => {
    expect(sanitizeHumanInput("   ")).toBeUndefined();
  });
});

describe("imageUrlToHost", () => {
  it("extracts host from https url", () => {
    expect(imageUrlToHost("https://cdn.shopify.com/x.png?q=1")).toBe(
      "cdn.shopify.com",
    );
  });
});

describe("resolveAgentRunStatus", () => {
  it("marks slow runs as timeout", () => {
    expect(
      resolveAgentRunStatus({ explicitStatus: "success", durationMs: 200_000 }),
    ).toBe("timeout");
  });

  it("keeps explicit error", () => {
    expect(
      resolveAgentRunStatus({ explicitStatus: "error", durationMs: 100 }),
    ).toBe("error");
  });
});

describe("truncateText", () => {
  it("leaves short strings unchanged", () => {
    expect(truncateText("hi", 10)).toBe("hi");
  });
});
