import { describe, expect, it } from "vitest";
import { decideEmptyImportReview } from "../../../app/lib/productImportEmptyReview";

describe("decideEmptyImportReview", () => {
  it("completes a pending import with no writable rows", () => {
    expect(
      decideEmptyImportReview({
        taskType: "product_import",
        status: "pending_review",
        rawResult: { fieldRows: [], summary: { changed: 0 } },
      }),
    ).toBe("complete");
  });

  it("refuses to skip write-back when there are writable rows", () => {
    expect(
      decideEmptyImportReview({
        taskType: "product_import",
        status: "pending_review",
        rawResult: {
          fieldRows: [
            {
              productId: "gid://shopify/Product/1",
              productTitle: "Tee",
              field: "title",
              beforeValue: "Old",
              afterValue: "New",
              skipped: false,
            },
          ],
        },
      }),
    ).toBe("has_writes");
  });

  it("is idempotent after succeeded or applied", () => {
    expect(
      decideEmptyImportReview({
        taskType: "product_import",
        status: "succeeded",
        rawResult: {},
      }),
    ).toBe("already_completed");
    expect(
      decideEmptyImportReview({
        taskType: "product_import",
        status: "applied",
        rawResult: {},
      }),
    ).toBe("already_completed");
  });

  it("does not complete other task types or running imports", () => {
    expect(
      decideEmptyImportReview({
        taskType: "product_export",
        status: "pending_review",
        rawResult: {},
      }),
    ).toBe("not_reviewable");
    expect(
      decideEmptyImportReview({
        taskType: "product_import",
        status: "running",
        rawResult: {},
      }),
    ).toBe("not_reviewable");
  });
});
