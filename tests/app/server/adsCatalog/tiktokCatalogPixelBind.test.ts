import { describe, expect, it } from "vitest";
import { getTiktokEventSourceBindErrorCode } from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";

describe("getTiktokEventSourceBindErrorCode", () => {
  it("maps TikTok 1000018 to stable error code", () => {
    expect(
      getTiktokEventSourceBindErrorCode(
        "TikTok Catalog event source bind failed: HTTP 200 ERRCODE_EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV.",
      ),
    ).toBe("EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV");
  });

  it("returns undefined for unrelated errors", () => {
    expect(getTiktokEventSourceBindErrorCode("network timeout")).toBeUndefined();
  });
});
