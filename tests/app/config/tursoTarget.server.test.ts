import { describe, expect, it } from "vitest";
import {
  normalizeEnvValue,
  readTursoCredentials,
  resolveTursoTarget,
} from "../../../app/config/tursoTarget.server";

const TEST_URL = "libsql://spark-test-whoeven99.aws-us-west-2.turso.io";
const PROD_URL = "libsql://prod-db.turso.io";
const PLACEHOLDER_PROD = "libsql://your-prod-db.aws-us-west-2.turso.io";

describe("normalizeEnvValue", () => {
  it("strips surrounding quotes", () => {
    expect(normalizeEnvValue('"test"')).toBe("test");
    expect(normalizeEnvValue("'test'")).toBe("test");
  });
});

describe("resolveTursoTarget", () => {
  it("honors explicit TURSO_TARGET even with quotes", () => {
    expect(
      resolveTursoTarget({
        TURSO_TARGET: '"test"',
        NODE_ENV: "production",
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("test");
  });

  it("uses test when only test credentials are configured (Render Test)", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "production",
        TURSO_TEST_DATABASE_URL: TEST_URL,
      }),
    ).toBe("test");
  });

  it("ignores placeholder prod URL when test is configured", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "production",
        TURSO_TEST_DATABASE_URL: TEST_URL,
        TURSO_PROD_DATABASE_URL: PLACEHOLDER_PROD,
      }),
    ).toBe("test");
  });

  it("uses prod when only prod credentials are configured", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "development",
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("prod");
  });

  it("prefers prod when both real URLs exist and NODE_ENV is production", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "production",
        TURSO_TEST_DATABASE_URL: TEST_URL,
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("prod");
  });

  it("defaults to test when no valid URL is configured", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "production",
      }),
    ).toBe("test");
  });
});

describe("readTursoCredentials", () => {
  it("reads test keys with explicit property access", () => {
    const creds = readTursoCredentials("test", {
      TURSO_TEST_DATABASE_URL: TEST_URL,
      TURSO_TEST_AUTH_TOKEN: "tok",
    });
    expect(creds.url).toBe(TEST_URL);
    expect(creds.authToken).toBe("tok");
    expect(creds.urlKey).toBe("TURSO_TEST_DATABASE_URL");
  });
});
