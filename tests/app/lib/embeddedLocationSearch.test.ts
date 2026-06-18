import { describe, expect, it, beforeEach } from "vitest";
import {
  appendEmbeddedSearchToPath,
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
