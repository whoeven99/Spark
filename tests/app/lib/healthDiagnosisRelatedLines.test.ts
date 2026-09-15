import { describe, expect, it } from "vitest";
import { summarizeDiagnosisRelatedLines } from "../../../app/lib/healthDiagnosisRelatedLines";

describe("summarizeDiagnosisRelatedLines", () => {
  it("summarizes overdue orders", () => {
    expect(
      summarizeDiagnosisRelatedLines(
        {
          orders: [
            { orderNumber: "1042", ageHours: 61.2, fulfillmentStatus: "unfulfilled" },
            { orderNumber: "#1038", ageHours: 54, fulfillmentStatus: "unfulfilled" },
          ],
        },
        "zh",
      ),
    ).toEqual([
      "#1042 · 超时 61 小时 · unfulfilled",
      "#1038 · 超时 54 小时 · unfulfilled",
    ]);
  });

  it("caps at five lines and falls back to unnamed arrays", () => {
    const lines = summarizeDiagnosisRelatedLines(
      {
        items: Array.from({ length: 8 }, (_, index) => ({
          sku: `SKU-${index + 1}`,
          available: index,
        })),
      },
      "en",
    );
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("SKU-1");
  });
});
