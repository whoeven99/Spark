import { describe, expect, it } from "vitest";
import { diffProfileFields, diffTokenFields } from "../../../../app/server/profile/profileDiff.server";

describe("diffProfileFields", () => {
  it("returns only changed fields", () => {
    const patch = diffProfileFields(
      {
        firstName: "John",
        lastName: "Smith",
        email: "a@test.com",
      },
      {
        firstName: "John",
        lastName: "Tom",
        email: "a@test.com",
      },
    );
    expect(patch).toEqual({ lastName: "Tom" });
  });

  it("returns null when nothing changed", () => {
    const patch = diffProfileFields(
      {
        firstName: "John",
        lastName: "Smith",
        email: "a@test.com",
      },
      {
        firstName: "John",
        lastName: "Smith",
        email: "a@test.com",
      },
    );
    expect(patch).toBeNull();
  });

  it("patches all fields when db row is null", () => {
    const patch = diffProfileFields(null, {
      firstName: "A",
      lastName: "B",
      email: "c@test.com",
    });
    expect(patch).toEqual({
      firstName: "A",
      lastName: "B",
      email: "c@test.com",
    });
  });
});

describe("diffTokenFields", () => {
  it("returns accessToken patch when changed", () => {
    const patch = diffTokenFields(
      {
        firstName: null,
        lastName: null,
        email: null,
        accessToken: "old-token",
        refreshToken: null,
        refreshTokenExpires: null,
      },
      { accessToken: "new-token" },
    );
    expect(patch).toEqual({ accessToken: "new-token" });
  });

  it("returns null when accessToken unchanged", () => {
    const patch = diffTokenFields(
      {
        firstName: null,
        lastName: null,
        email: null,
        accessToken: "same",
        refreshToken: null,
        refreshTokenExpires: null,
      },
      { accessToken: "same" },
    );
    expect(patch).toBeNull();
  });
});
