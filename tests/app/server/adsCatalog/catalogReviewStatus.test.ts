import { describe, expect, it } from "vitest";
import {
  collectCapabilityReviewStatuses,
  deriveMetaProductReviewStatus,
  normalizeMetaReviewToken,
} from "~/server/adsCatalog/metaCatalogStatusChecker.server";
import { normalizeDestinationReviewStatus } from "~/server/adsCatalog/gmcStatusChecker.server";

describe("deriveMetaProductReviewStatus", () => {
  it("maps legacy review_status values", () => {
    expect(deriveMetaProductReviewStatus({ review_status: "approved" })).toBe("approved");
    expect(deriveMetaProductReviewStatus({ review_status: "rejected" })).toBe("disapproved");
  });

  it("derives status from capability_to_review_status when review_status is missing", () => {
    expect(
      deriveMetaProductReviewStatus({
        capability_to_review_status: [{ DA: "APPROVED" }],
      }),
    ).toBe("approved");
    expect(
      deriveMetaProductReviewStatus({
        capability_to_review_status: [{ key: "DA", value: "REJECTED" }],
      }),
    ).toBe("disapproved");
    expect(
      deriveMetaProductReviewStatus({
        capability_to_review_status: [{ key: "DA", value: "PENDING" }],
      }),
    ).toBe("pending");
  });

  it("treats NO_REVIEW as pending", () => {
    expect(normalizeMetaReviewToken("NO_REVIEW")).toBe("pending");
    expect(
      deriveMetaProductReviewStatus({
        capability_to_review_status: ["NO_REVIEW"],
      }),
    ).toBe("pending");
  });

  it("uses review_rejection_reasons as disapproved signal", () => {
    expect(
      deriveMetaProductReviewStatus({
        review_rejection_reasons: ["Missing required field: brand"],
      }),
    ).toBe("disapproved");
  });
});

describe("collectCapabilityReviewStatuses", () => {
  it("flattens map and key/value shapes", () => {
    expect(collectCapabilityReviewStatuses([{ DA: "APPROVED" }, { key: "IG", value: "REJECTED" }])).toEqual([
      "APPROVED",
      "REJECTED",
    ]);
  });
});

describe("normalizeDestinationReviewStatus", () => {
  it("uses country arrays when legacy status is absent", () => {
    expect(
      normalizeDestinationReviewStatus({
        destination: "Shopping",
        disapprovedCountries: ["US"],
      }),
    ).toBe("disapproved");
    expect(
      normalizeDestinationReviewStatus({
        destination: "Shopping",
        pendingCountries: ["US"],
      }),
    ).toBe("pending");
    expect(
      normalizeDestinationReviewStatus({
        destination: "Shopping",
        approvedCountries: ["US"],
      }),
    ).toBe("approved");
  });
});
