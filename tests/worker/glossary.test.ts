import { beforeEach, describe, expect, it, vi } from "vitest";

const { blobReadMock } = vi.hoisted(() => ({ blobReadMock: vi.fn() }));
vi.mock("../../worker/src/services/blobV4.js", () => ({
  blobRead: blobReadMock,
}));

import { loadGlossaryLines, __clearGlossaryCache, type GlossaryFile } from "../../worker/src/services/glossary.js";

beforeEach(() => {
  blobReadMock.mockReset();
  __clearGlossaryCache();
});

describe("loadGlossaryLines", () => {
  it("returns empty array when no glossary exists", async () => {
    blobReadMock.mockResolvedValueOnce(null);
    expect(await loadGlossaryLines("shop.myshopify.com", "en")).toEqual([]);
  });

  it("emits translate lines only for the requested target, sorted", async () => {
    const file: GlossaryFile = {
      terms: [
        { source: "闪购", translations: { en: "Flash Sale", fr: "Vente flash" } },
        { source: "满减", translations: { fr: "Réduction" } }, // no en → excluded
        { source: "新品", translations: { en: "New Arrival" } },
      ],
    };
    blobReadMock.mockResolvedValueOnce(file);
    const lines = await loadGlossaryLines("shop.myshopify.com", "en");
    expect(lines).toEqual([
      `- Translate "新品" as "New Arrival".`,
      `- Translate "闪购" as "Flash Sale".`,
    ]);
  });

  it("emits do-not-translate lines for every target", async () => {
    const file: GlossaryFile = { terms: [{ source: "Acme", doNotTranslate: true }] };
    blobReadMock.mockResolvedValueOnce(file);
    expect(await loadGlossaryLines("shop.myshopify.com", "ja")).toEqual([
      `- Keep "Acme" unchanged (do not translate).`,
    ]);
  });

  it("caches results and does not re-read Blob within TTL", async () => {
    blobReadMock.mockResolvedValueOnce({ terms: [{ source: "X", translations: { en: "Y" } }] });
    await loadGlossaryLines("shop.myshopify.com", "en");
    await loadGlossaryLines("shop.myshopify.com", "en");
    expect(blobReadMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when Blob read fails", async () => {
    blobReadMock.mockRejectedValueOnce(new Error("blob down"));
    expect(await loadGlossaryLines("shop.myshopify.com", "en")).toEqual([]);
  });
});
