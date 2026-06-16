import { describe, expect, it } from "vitest";
import { parseProductOperationsRows } from "../../../../app/server/operations/productOperationsQuery.server";

describe("parseProductOperationsRows", () => {
  it("aggregates product operation issues", () => {
    const draft = [
      { title: "Summer Hat - Draft" },
      { title: "Winter Coat - Draft" },
    ];
    const noImages = [{ title: "Missing Images Product" }];
    const noDesc = [
      { title: "No Desc 1" },
      { title: "No Desc 2" },
    ];

    const result = parseProductOperationsRows(draft, noImages, noDesc);

    expect(result.draftProductCount).toBe(2);
    expect(result.noImagesProductCount).toBe(1);
    expect(result.noDescriptionProductCount).toBe(2);
    expect(result.draftProducts).toHaveLength(2);
    expect(result.draftProducts[0].title).toBe("Summer Hat - Draft");
    expect(result.samples.draftSample).toHaveLength(2);
    expect(result.samples.noDescriptionSample).toHaveLength(2);
  });

  it("handles empty lists", () => {
    const result = parseProductOperationsRows([], [], []);
    expect(result.draftProductCount).toBe(0);
    expect(result.noImagesProductCount).toBe(0);
    expect(result.noDescriptionProductCount).toBe(0);
  });

  it("limits samples to 5/3/3", () => {
    const largeDraft = Array(10).fill(null).map((_, i) => ({ title: `Draft ${i}` }));
    const largeNoImages = Array(10).fill(null).map((_, i) => ({ title: `NoImg ${i}` }));
    const largeNoDesc = Array(10).fill(null).map((_, i) => ({ title: `NoDesc ${i}` }));

    const result = parseProductOperationsRows(largeDraft, largeNoImages, largeNoDesc);

    expect(result.samples.draftSample).toHaveLength(5);
    expect(result.samples.noImagesSample).toHaveLength(3);
    expect(result.samples.noDescriptionSample).toHaveLength(3);
  });
});
