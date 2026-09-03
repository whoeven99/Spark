import { describe, expect, it } from "vitest";
import {
  CUSTOM_LIQUID_MODULE,
  jobModulesWithLiquid,
} from "../../../../admin/server/lib/jobModulesWithLiquid.js";

describe("jobModulesWithLiquid", () => {
  it("returns shopify modules unchanged when includeLiquid is false", () => {
    expect(
      jobModulesWithLiquid({ modules: ["PRODUCT", "PAGE"], includeLiquid: false }),
    ).toEqual(["PRODUCT", "PAGE"]);
  });

  it("appends CUSTOM_LIQUID for liquid-only jobs with empty modules", () => {
    expect(jobModulesWithLiquid({ modules: [], includeLiquid: true })).toEqual([
      CUSTOM_LIQUID_MODULE,
    ]);
  });

  it("appends CUSTOM_LIQUID after shopify modules without duplicating", () => {
    expect(
      jobModulesWithLiquid({
        modules: ["PRODUCT", CUSTOM_LIQUID_MODULE],
        includeLiquid: true,
      }),
    ).toEqual(["PRODUCT", CUSTOM_LIQUID_MODULE]);
    expect(
      jobModulesWithLiquid({ modules: ["PRODUCT"], includeLiquid: true }),
    ).toEqual(["PRODUCT", CUSTOM_LIQUID_MODULE]);
  });

  it("treats missing modules / includeLiquid as empty shopify-only", () => {
    expect(jobModulesWithLiquid({})).toEqual([]);
    expect(jobModulesWithLiquid({ modules: null, includeLiquid: null })).toEqual([]);
  });
});
