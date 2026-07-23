import { describe, expect, it } from "vitest";
import {
  isTiktokCatalogApiSyncable,
  resolveTiktokCatalogSyncStatus,
} from "../../../app/lib/tiktokCatalogSyncability";

describe("tiktokCatalogSyncability", () => {
  it("treats channel=CLIENT as syncable", () => {
    expect(
      isTiktokCatalogApiSyncable({ channel: "CLIENT", bindingMode: "api_managed" }),
    ).toBe(true);
    expect(
      resolveTiktokCatalogSyncStatus({ channel: "CLIENT", bindingMode: "api_managed" }),
    ).toBe("syncable");
  });

  it("treats missing channel as not syncable", () => {
    expect(
      isTiktokCatalogApiSyncable({ channel: "", bindingMode: "api_managed" }),
    ).toBe(false);
    expect(
      resolveTiktokCatalogSyncStatus({ channel: "", bindingMode: "api_managed" }),
    ).toBe("not_syncable");
    expect(
      resolveTiktokCatalogSyncStatus({ bindingMode: "api_managed" }),
    ).toBe("not_syncable");
  });

  it("treats shopify official as official", () => {
    expect(
      resolveTiktokCatalogSyncStatus({
        bindingMode: "shopify_official",
        channel: "CLIENT",
      }),
    ).toBe("official");
  });
});
