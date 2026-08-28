import { describe, expect, it } from "vitest";
import {
  CONVERSATION_DISPLAY_TIME_ZONE_CN,
  CONVERSATION_DISPLAY_TIME_ZONE_UTC,
  resolveConversationDisplayTimeZone,
  resolveViewerCountryCode,
} from "../../../app/lib/viewerCountry";
import { formatConversationTimestamp } from "../../../app/routes/page/workspace/messageTransforms";

describe("resolveViewerCountryCode", () => {
  it("reads Cloudflare country header", () => {
    expect(resolveViewerCountryCode(new Headers({ "cf-ipcountry": "cn" }))).toBe("CN");
  });

  it("ignores unknown country tokens", () => {
    expect(resolveViewerCountryCode(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(resolveViewerCountryCode(new Headers())).toBeNull();
  });
});

describe("resolveConversationDisplayTimeZone", () => {
  it("uses Shanghai only when country is CN", () => {
    expect(resolveConversationDisplayTimeZone(new Headers({ "cf-ipcountry": "CN" }))).toBe(
      CONVERSATION_DISPLAY_TIME_ZONE_CN,
    );
    expect(resolveConversationDisplayTimeZone(new Headers({ "cf-ipcountry": "US" }))).toBe(
      CONVERSATION_DISPLAY_TIME_ZONE_UTC,
    );
    expect(resolveConversationDisplayTimeZone(new Headers())).toBe(CONVERSATION_DISPLAY_TIME_ZONE_UTC);
  });
});

describe("formatConversationTimestamp", () => {
  const iso = "2026-08-28T12:00:00.000Z";

  it("defaults to UTC", () => {
    expect(formatConversationTimestamp(iso)).toBe("2026-08-28 12:00:00");
  });

  it("shifts to Shanghai when requested", () => {
    expect(formatConversationTimestamp(iso, "Asia/Shanghai")).toBe("2026-08-28 20:00:00");
  });
});
