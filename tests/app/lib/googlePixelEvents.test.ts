import { describe, expect, it } from "vitest";
import {
  buildGooglePixelConversionActionName,
  migrateLegacyEventConversions,
  normalizeGooglePixelSetupEvents,
  resolveEventConversionLabel,
} from "../../../app/lib/googlePixelEvents";
import { parseConversionLabelFromSnippets } from "../../../app/server/adsCatalog/googleConversionActions.server";

describe("googlePixelEvents", () => {
  it("默认推荐事件包含四类核心转化", () => {
    expect(normalizeGooglePixelSetupEvents(undefined)).toEqual([
      "page_view",
      "add_to_cart",
      "begin_checkout",
      "purchase",
    ]);
  });

  it("从旧版单 label 迁移到多事件配置", () => {
    const migrated = migrateLegacyEventConversions({
      enabledEvents: ["page_view", "purchase"],
      conversionLabel: "abc123",
      pixelName: "ciwishop",
      labelOf: () => "Page View",
    });
    expect(migrated.page_view?.label).toBe("abc123");
    expect(migrated.purchase?.label).toBe("abc123");
  });

  it("按事件读取 label，禁用项返回空", () => {
    expect(
      resolveEventConversionLabel(
        { page_view: { label: "pv", name: "x", disabled: true } },
        "page_view",
      ),
    ).toBe("");
    expect(
      resolveEventConversionLabel(
        { purchase: { label: "buy", name: "x" } },
        "purchase",
        "legacy",
      ),
    ).toBe("buy");
  });

  it("生成 Google Ads 转化操作名称", () => {
    expect(
      buildGooglePixelConversionActionName({
        pixelName: "ciwishop",
        eventKey: "page_view",
        eventDisplayName: "Page View",
      }),
    ).toBe("ciwishop (Page View)");
  });
});

describe("parseConversionLabelFromSnippets", () => {
  it("从 event_snippet 解析 send_to label", () => {
    const label = parseConversionLabelFromSnippets({
      tag_snippets: [
        {
          event_snippet:
            "gtag('event', 'conversion', {'send_to': 'AW-123456789/AbCdEfGh'});",
        },
      ],
    });
    expect(label).toBe("AbCdEfGh");
  });
});
