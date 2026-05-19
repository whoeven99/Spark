import { describe, expect, it } from "vitest";
import { resolveTursoTarget } from "../../../app/config/tursoTarget.server";

const TEST_URL = "libsql://test-db.turso.io";
const PROD_URL = "libsql://prod-db.turso.io";

describe("resolveTursoTarget", () => {
  it("honors explicit TURSO_TARGET", () => {
    expect(
      resolveTursoTarget({
        TURSO_TARGET: "test",
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

  it("uses prod when only prod credentials are configured", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "development",
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("prod");
  });

  it("prefers prod when both are configured and NODE_ENV is production", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "production",
        TURSO_TEST_DATABASE_URL: TEST_URL,
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("prod");
  });

  it("prefers test when both are configured and NODE_ENV is not production", () => {
    expect(
      resolveTursoTarget({
        NODE_ENV: "development",
        TURSO_TEST_DATABASE_URL: TEST_URL,
        TURSO_PROD_DATABASE_URL: PROD_URL,
      }),
    ).toBe("test");
  });
});
