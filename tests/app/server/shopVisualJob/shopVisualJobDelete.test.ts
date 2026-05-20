import { describe, expect, it } from "vitest";
import { collectBlobPathsFromMetadata } from "../../../../app/server/shopVisualJob/shopVisualJobDelete.server";

describe("collectBlobPathsFromMetadata", () => {
  it("collects known blob path fields", () => {
    const paths = collectBlobPathsFromMetadata({
      sourceBlobPath: "picture-translate/source/shop/a.jpg",
      blobPath: "picture-translate/shop/id.jpg",
      extraBlobPaths: ["generated-images/shop/x.png"],
    });
    expect(paths).toEqual([
      "picture-translate/source/shop/a.jpg",
      "picture-translate/shop/id.jpg",
      "generated-images/shop/x.png",
    ]);
  });

  it("returns empty for invalid metadata", () => {
    expect(collectBlobPathsFromMetadata(null)).toEqual([]);
  });
});
