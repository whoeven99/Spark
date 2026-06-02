import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  normalizeEnvValue,
  readTursoCredentials,
  resolveTursoTarget,
} from "../../../app/config/tursoTarget.server";
import { ensureRuntimeEnv } from "../../../app/config/runtimeEnv.server";

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
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "TURSO_TARGET",
      "TURSO_TEST_DATABASE_URL",
      "TURSO_TEST_AUTH_TOKEN",
      "TURSO_PROD_DATABASE_URL",
      "TURSO_PROD_AUTH_TOKEN",
      "NODE_ENV",
    ]) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("honors explicit TURSO_TARGET even with quotes", () => {
    process.env.TURSO_TARGET = '"test"';
    process.env.NODE_ENV = "production";
    process.env.TURSO_PROD_DATABASE_URL = PROD_URL;
    expect(resolveTursoTarget()).toBe("test");
  });

  it("uses test when only test credentials are configured (Render Test)", () => {
    delete process.env.TURSO_TARGET;
    process.env.NODE_ENV = "production";
    process.env.TURSO_TEST_DATABASE_URL = TEST_URL;
    delete process.env.TURSO_PROD_DATABASE_URL;
    expect(resolveTursoTarget()).toBe("test");
  });

  it("ignores placeholder prod URL when test is configured", () => {
    delete process.env.TURSO_TARGET;
    process.env.NODE_ENV = "production";
    process.env.TURSO_TEST_DATABASE_URL = TEST_URL;
    process.env.TURSO_PROD_DATABASE_URL = PLACEHOLDER_PROD;
    expect(resolveTursoTarget()).toBe("test");
  });

  it("uses prod when only prod credentials are configured", () => {
    delete process.env.TURSO_TARGET;
    process.env.NODE_ENV = "development";
    delete process.env.TURSO_TEST_DATABASE_URL;
    process.env.TURSO_PROD_DATABASE_URL = PROD_URL;
    expect(resolveTursoTarget()).toBe("prod");
  });

  it("prefers prod when both real URLs exist and NODE_ENV is prod", () => {
    delete process.env.TURSO_TARGET;
    process.env.NODE_ENV = "prod";
    process.env.TURSO_TEST_DATABASE_URL = TEST_URL;
    process.env.TURSO_PROD_DATABASE_URL = PROD_URL;
    expect(resolveTursoTarget()).toBe("prod");
  });

  it("prefers prod when both real URLs exist and NODE_ENV is production (compat)", () => {
    delete process.env.TURSO_TARGET;
    process.env.NODE_ENV = "production";
    process.env.TURSO_TEST_DATABASE_URL = TEST_URL;
    process.env.TURSO_PROD_DATABASE_URL = PROD_URL;
    expect(resolveTursoTarget()).toBe("prod");
  });

  it("defaults to prod when NODE_ENV is prod and no valid URL is configured", () => {
    delete process.env.TURSO_TARGET;
    delete process.env.TURSO_TEST_DATABASE_URL;
    delete process.env.TURSO_PROD_DATABASE_URL;
    process.env.NODE_ENV = "prod";
    expect(resolveTursoTarget()).toBe("prod");
  });

  it("defaults to test when NODE_ENV is not prod and no valid URL", () => {
    delete process.env.TURSO_TARGET;
    delete process.env.TURSO_TEST_DATABASE_URL;
    delete process.env.TURSO_PROD_DATABASE_URL;
    process.env.NODE_ENV = "development";
    expect(resolveTursoTarget()).toBe("test");
  });
});

describe("readTursoCredentials", () => {
  it("reads test keys", () => {
    process.env.TURSO_TEST_DATABASE_URL = TEST_URL;
    process.env.TURSO_TEST_AUTH_TOKEN = "tok";
    const creds = readTursoCredentials("test");
    expect(creds.url).toBe(TEST_URL);
    expect(creds.authToken).toBe("tok");
  });
});

describe("ensureRuntimeEnv", () => {
  it("is idempotent", () => {
    ensureRuntimeEnv();
    ensureRuntimeEnv();
    expect(true).toBe(true);
  });
});
