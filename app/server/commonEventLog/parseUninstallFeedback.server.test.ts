import { describe, expect, it } from "vitest";
import {
  mergeUninstallFeedback,
  parseUninstallFeedbackFromPayload,
} from "./parseUninstallFeedback.server";

describe("parseUninstallFeedbackFromPayload", () => {
  it("reads top-level reason and description", () => {
    const result = parseUninstallFeedbackFromPayload({
      reason: "Too expensive",
      description: "Monthly cost too high for our store",
    });
    expect(result).toEqual({
      reason: "Too expensive",
      description: "Monthly cost too high for our store",
      source: "webhook_payload",
    });
  });

  it("reads nested relationshipUninstalled", () => {
    const result = parseUninstallFeedbackFromPayload({
      relationshipUninstalled: {
        reason: "Not using app now",
        description: "Paused operations",
      },
    });
    expect(result?.reason).toBe("Not using app now");
    expect(result?.description).toBe("Paused operations");
  });

  it("merges candidates with first non-empty fields", () => {
    const merged = mergeUninstallFeedback(
      { reason: "Too expensive", description: null, source: "webhook_payload" },
      {
        reason: null,
        description: "Need cheaper plan",
        source: "partner_api",
      },
    );
    expect(merged).toEqual({
      reason: "Too expensive",
      description: "Need cheaper plan",
      source: "webhook_payload",
    });
  });
});
