import { describe, expect, it } from "vitest";
import {
  parseAndValidateGeneratedDescriptionJson,
  parseAndValidateProductDescriptionJson,
  parseAndValidateProductDescriptionReviewJson,
  stripJsonFence,
} from "../../../../app/server/productImprove/generatedDescriptionJson.server";

describe("stripJsonFence", () => {
  it("unwraps json code fence", () => {
    const raw = "```json\n{ \"a\": 1 }\n```";
    expect(stripJsonFence(raw)).toBe("{ \"a\": 1 }");
  });
});

describe("parseAndValidateProductDescriptionJson", () => {
  it("accepts title and description", () => {
    const text = JSON.stringify({
      title: "  Optimized Title  ",
      description: "  Hello world  ",
    });
    const out = parseAndValidateProductDescriptionJson(text);
    expect(out).toEqual({
      title: "Optimized Title",
      description: "Hello world",
    });
  });

  it("aliases deprecated parse name", () => {
    const text = JSON.stringify({
      title: "T",
      description: "x",
    });
    expect(parseAndValidateGeneratedDescriptionJson(text)).toEqual({
      title: "T",
      description: "x",
    });
  });

  it("rejects description-only payloads", () => {
    const text = JSON.stringify({
      description: "b",
    });
    expect(() => parseAndValidateProductDescriptionJson(text)).toThrow("title");
  });

  it("rejects extra keys", () => {
    const text = JSON.stringify({
      title: "a",
      description: "b",
      foo: 1,
    });
    expect(() => parseAndValidateProductDescriptionJson(text)).toThrow(
      "仅允许",
    );
  });

  it("rejects invalid json", () => {
    expect(() => parseAndValidateProductDescriptionJson("not json")).toThrow(
      "不是合法 JSON",
    );
  });

  it("shares schema with review parser", () => {
    const text = JSON.stringify({ title: "A", description: "B" });
    expect(parseAndValidateProductDescriptionReviewJson(text)).toEqual({
      title: "A",
      description: "B",
    });
  });
});
