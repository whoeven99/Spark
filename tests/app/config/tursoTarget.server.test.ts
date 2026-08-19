import { afterEach, describe, expect, it } from "vitest";
import {
  isLibsqlUrl,
  readTursoCredentials,
} from "../../../app/config/tursoTarget.server";

const TEST_URL = "libsql://spark-test-whoeven99.aws-us-west-2.turso.io";
const PLACEHOLDER = "libsql://your-prod-db.turso.io";

describe("isLibsqlUrl", () => {
  it("accepts real libsql urls", () => {
    expect(isLibsqlUrl(TEST_URL)).toBe(true);
  });

  it("rejects placeholders", () => {
    expect(isLibsqlUrl(PLACEHOLDER)).toBe(false);
  });

  it("rejects non-libsql", () => {
    expect(isLibsqlUrl("https://example.com")).toBe(false);
  });
});

describe("readTursoCredentials", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key]!;
    }
  });

  function stash() {
    for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
      saved[key] = process.env[key];
    }
  }

  it("reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN", () => {
    stash();
    process.env.TURSO_DATABASE_URL = TEST_URL;
    process.env.TURSO_AUTH_TOKEN = "tok";
    const creds = readTursoCredentials();
    expect(creds).toEqual({
      url: TEST_URL,
      authToken: "tok",
      urlKey: "TURSO_DATABASE_URL",
      tokenKey: "TURSO_AUTH_TOKEN",
    });
  });
});
