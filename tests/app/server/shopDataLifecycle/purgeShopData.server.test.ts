import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/db.server", () => ({
  default: {},
}));

const { COMMON_EVENT_TYPE } = await import(
  "../../../../app/server/commonEventLog/types.server"
);
const { buildCommonEventLogPurgeWhere } = await import(
  "../../../../app/server/shopDataLifecycle/purgeShopData.server"
);

describe("buildCommonEventLogPurgeWhere", () => {
  it("keeps APP_UNINSTALLED rows when retaining uninstall logs", () => {
    expect(buildCommonEventLogPurgeWhere("demo.myshopify.com", true)).toEqual({
      shop: "demo.myshopify.com",
      eventType: { not: COMMON_EVENT_TYPE.APP_UNINSTALLED },
    });
  });

  it("deletes all CommonEventLog rows for shop/redact", () => {
    expect(buildCommonEventLogPurgeWhere("demo.myshopify.com", false)).toEqual({
      shop: "demo.myshopify.com",
    });
  });
});
