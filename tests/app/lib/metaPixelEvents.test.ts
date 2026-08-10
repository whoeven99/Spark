import { describe, expect, it } from "vitest";
import {
  META_PIXEL_DEFAULT_EVENTS,
  normalizeMetaEnabledEvents,
} from "../../../app/lib/metaPixelEvents";

describe("normalizeMetaEnabledEvents", () => {
  it("returns defaults for invalid input", () => {
    expect(normalizeMetaEnabledEvents(null)).toEqual([...META_PIXEL_DEFAULT_EVENTS]);
    expect(normalizeMetaEnabledEvents([])).toEqual([...META_PIXEL_DEFAULT_EVENTS]);
  });

  it("filters unknown events and dedupes", () => {
    expect(
      normalizeMetaEnabledEvents(["Purchase", "Purchase", "Foo", "PageView"]),
    ).toEqual(["Purchase", "PageView"]);
  });
});
