import { describe, expect, it } from "vitest";
import { splitShopOwnerName } from "../../../../app/server/session/syncSessionUserProfile.server";

describe("splitShopOwnerName", () => {
  it("splits first and last name", () => {
    expect(splitShopOwnerName("John Doe")).toEqual({
      firstName: "John",
      lastName: "Doe",
    });
  });

  it("handles multiple last name parts", () => {
    expect(splitShopOwnerName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("returns only firstName for single token", () => {
    expect(splitShopOwnerName("Madonna")).toEqual({ firstName: "Madonna" });
  });

  it("trims surrounding whitespace", () => {
    expect(splitShopOwnerName("  Ada   Lovelace  ")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });
});
