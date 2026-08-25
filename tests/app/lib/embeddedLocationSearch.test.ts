// resolveEmbeddedLocationSearch 读写 sessionStorage，需要 DOM 环境。
// Vitest 4 已移除 environmentMatchGlobs，按文件声明是唯一的按需开法。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  appendEmbeddedSearchToPath,
  buildEmbeddedHomeRedirectPath,
  pickEmbeddedSearch,
  resolveEmbeddedLocationSearch,
} from "../../../app/lib/embeddedLocationSearch";

describe("pickEmbeddedSearch", () => {
  it("keeps only embedded auth keys", () => {
    expect(
      pickEmbeddedSearch("?shop=demo.myshopify.com&host=abc&tab=sync&embedded=1"),
    ).toBe("?shop=demo.myshopify.com&host=abc&embedded=1");
  });
});

describe("appendEmbeddedSearchToPath", () => {
  it("merges embedded params into path query", () => {
    expect(
      appendEmbeddedSearchToPath(
        "/app/image-studio?tab=translate",
        "?shop=demo.myshopify.com&host=abc",
      ),
    ).toBe("/app/image-studio?tab=translate&shop=demo.myshopify.com&host=abc");
  });
});

describe("resolveEmbeddedLocationSearch", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("falls back to cached embedded search when current url has no shop/host", () => {
    sessionStorage.setItem(
      "spark:embedded-search",
      "?shop=cached.myshopify.com&host=xyz",
    );
    expect(resolveEmbeddedLocationSearch("?tab=tasks")).toBe(
      "?shop=cached.myshopify.com&host=xyz",
    );
  });

  it("prefers current url embedded params over cache", () => {
    sessionStorage.setItem(
      "spark:embedded-search",
      "?shop=cached.myshopify.com&host=xyz",
    );
    expect(resolveEmbeddedLocationSearch("?shop=live.myshopify.com&host=live")).toBe(
      "?shop=live.myshopify.com&host=live",
    );
  });
});

describe("buildEmbeddedHomeRedirectPath", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("restores cached shop/host onto /app", () => {
    sessionStorage.setItem(
      "spark:embedded-search",
      "?shop=cached.myshopify.com&host=xyz&embedded=1",
    );
    expect(buildEmbeddedHomeRedirectPath("/app")).toBe(
      "/app?shop=cached.myshopify.com&host=xyz&embedded=1",
    );
  });

  it("falls back to embedded=1 when cache is empty", () => {
    expect(buildEmbeddedHomeRedirectPath("/app")).toBe("/app?embedded=1");
  });
});
