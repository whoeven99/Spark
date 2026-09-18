import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OAUTH_POPUP_STORAGE_KEY,
  readOAuthPopupStorageResult,
} from "../../app/lib/oauthPopupBridge";

describe("readOAuthPopupStorageResult", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    store.clear();
  });

  it("reads and clears a matching popup result", () => {
    localStorage.setItem(
      OAUTH_POPUP_STORAGE_KEY,
      JSON.stringify({ type: "gmc_oauth", gmcAuth: "error", reason: "no_merchant_account" }),
    );
    expect(readOAuthPopupStorageResult("gmc_oauth")).toEqual({
      type: "gmc_oauth",
      gmcAuth: "error",
      reason: "no_merchant_account",
    });
    expect(localStorage.getItem(OAUTH_POPUP_STORAGE_KEY)).toBeNull();
  });

  it("ignores a result for another oauth type", () => {
    localStorage.setItem(
      OAUTH_POPUP_STORAGE_KEY,
      JSON.stringify({ type: "google_oauth", googleAuth: "success" }),
    );
    expect(readOAuthPopupStorageResult("gmc_oauth")).toBeNull();
    expect(JSON.parse(localStorage.getItem(OAUTH_POPUP_STORAGE_KEY) ?? "{}")).toEqual({
      type: "google_oauth",
      googleAuth: "success",
    });
  });
});
