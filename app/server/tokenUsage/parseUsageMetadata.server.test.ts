import { describe, expect, it } from "vitest";
import {
  parseUsageMetadata,
  sumParsedTokenUsage,
} from "./parseUsageMetadata.server";

describe("parseUsageMetadata", () => {
  it("parses LangChain snake_case fields", () => {
    expect(
      parseUsageMetadata({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    });
  });

  it("derives total from input + output when total missing", () => {
    expect(
      parseUsageMetadata({ input_tokens: 5, output_tokens: 7 }),
    ).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
    });
  });

  it("returns zeros for invalid input", () => {
    expect(parseUsageMetadata(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("sumParsedTokenUsage", () => {
  it("sums multiple usages", () => {
    expect(
      sumParsedTokenUsage([
        { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
      ]),
    ).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
    });
  });
});
