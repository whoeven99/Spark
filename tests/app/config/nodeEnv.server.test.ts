import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isProductionNodeEnv,
  isTestNodeEnv,
  normalizedNodeEnv,
} from "../../../app/config/nodeEnv.server";

describe("nodeEnv.server", () => {
  const saved = process.env.NODE_ENV;

  afterEach(() => {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  });

  it("treats prod as production", () => {
    process.env.NODE_ENV = "prod";
    expect(isProductionNodeEnv()).toBe(true);
    expect(isTestNodeEnv()).toBe(false);
    expect(normalizedNodeEnv()).toBe("prod");
  });

  it("treats production as production (compat)", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionNodeEnv()).toBe(true);
  });

  it("treats quoted prod as production", () => {
    process.env.NODE_ENV = '"prod"';
    expect(isProductionNodeEnv()).toBe(true);
  });

  it("treats development as non-production", () => {
    process.env.NODE_ENV = "development";
    expect(isProductionNodeEnv()).toBe(false);
  });

  it("treats test as test env", () => {
    process.env.NODE_ENV = "test";
    expect(isTestNodeEnv()).toBe(true);
    expect(isProductionNodeEnv()).toBe(false);
  });
});
