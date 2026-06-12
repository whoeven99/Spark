import { describe, expect, it, vi } from "vitest";
import {
  getTranslationAutomationStorageKey,
  isTranslationAutomationItem,
  persistTranslationAutomationItems,
  readTranslationAutomationItems,
  type TranslationAutomationItem,
} from "../../../app/lib/translationV4Automation";

function createStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

const mockAutomation: TranslationAutomationItem = {
  id: "auto-1",
  shopName: "spark-demo.myshopify.com",
  source: "zh-CN",
  targets: ["en", "ja"],
  modules: ["PRODUCT", "PAGE"],
  frequency: "WEEKLY",
  createdAt: "2026-06-12T10:00:00.000Z",
  lastTriggeredAt: "2026-06-12T10:00:00.000Z",
};

describe("translationV4Automation", () => {
  it("builds storage key with shop suffix", () => {
    expect(getTranslationAutomationStorageKey("demo-shop")).toBe(
      "translation-v4-automations:demo-shop",
    );
  });

  it("recognizes valid automation item payload", () => {
    expect(isTranslationAutomationItem(mockAutomation)).toBe(true);
    expect(isTranslationAutomationItem({ ...mockAutomation, targets: "en" })).toBe(false);
  });

  it("reads only valid automation items from storage", () => {
    const storage = createStorageMock({
      [getTranslationAutomationStorageKey(mockAutomation.shopName)]: JSON.stringify([
        mockAutomation,
        { foo: "bar" },
      ]),
    });

    const result = readTranslationAutomationItems(mockAutomation.shopName, storage);
    expect(result).toEqual([mockAutomation]);
  });

  it("returns empty array when storage contains invalid json", () => {
    const storage = createStorageMock({
      [getTranslationAutomationStorageKey(mockAutomation.shopName)]: "{bad json",
    });

    expect(readTranslationAutomationItems(mockAutomation.shopName, storage)).toEqual([]);
  });

  it("persists automation items as json string", () => {
    const storage = createStorageMock();

    persistTranslationAutomationItems(mockAutomation.shopName, [mockAutomation], storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      getTranslationAutomationStorageKey(mockAutomation.shopName),
      JSON.stringify([mockAutomation]),
    );
  });
});
