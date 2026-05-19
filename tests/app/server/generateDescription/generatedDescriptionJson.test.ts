import { describe, expect, it } from "vitest";
import {
  parseAndValidateGeneratedDescriptionJson,
  parseAndValidateProductDescriptionJson,
  stripJsonFence,
} from "../../../../app/server/generateDescription/generatedDescriptionJson.server";

describe("stripJsonFence", () => {
  it("unwraps json code fence", () => {
    const raw = "```json\n{ \"a\": 1 }\n```";
    expect(stripJsonFence(raw)).toBe("{ \"a\": 1 }");
  });
});

describe("parseAndValidateProductDescriptionJson", () => {
  it("accepts minimal valid object", () => {
    const text = JSON.stringify({
      description: "  Hello world  ",
    });
    const out = parseAndValidateProductDescriptionJson(text);
    expect(out).toEqual({ description: "Hello world" });
  });

  it("aliases deprecated parse name", () => {
    const text = JSON.stringify({ description: "x" });
    expect(parseAndValidateGeneratedDescriptionJson(text)).toEqual({
      description: "x",
    });
  });

  it("rejects extra keys", () => {
    const text = JSON.stringify({
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
});
