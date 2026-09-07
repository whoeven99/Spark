import { describe, expect, it } from "vitest";
import {
  isUnlimitedReferralCap,
  referralRemaining,
  resolveReferralStatus,
} from "../../admin/server/lib/referralCodeView";

describe("referralCodeView", () => {
  it("maxUses=0 视为不限：剩余为 null，已用 0 也不是已满", () => {
    expect(isUnlimitedReferralCap(0)).toBe(true);
    expect(referralRemaining(0, 0)).toBeNull();
    expect(referralRemaining(0, 12)).toBeNull();
    expect(
      resolveReferralStatus({
        enabled: true,
        maxUses: 0,
        usedCount: 0,
        startsAt: null,
        endsAt: null,
      }),
    ).toBe("active");
  });

  it("maxUses=-1 也不当已满", () => {
    expect(isUnlimitedReferralCap(-1)).toBe(true);
    expect(referralRemaining(-1, 0)).toBeNull();
    expect(
      resolveReferralStatus({
        enabled: true,
        maxUses: -1,
        usedCount: 0,
        startsAt: null,
        endsAt: null,
      }),
    ).toBe("active");
  });

  it("默认 100 万是普通上限，不是不限", () => {
    expect(isUnlimitedReferralCap(1_000_000)).toBe(false);
    expect(referralRemaining(1_000_000, 0)).toBe(1_000_000);
    expect(
      resolveReferralStatus({
        enabled: true,
        maxUses: 1_000_000,
        usedCount: 0,
        startsAt: null,
        endsAt: null,
      }),
    ).toBe("active");
  });

  it("有上限时才用已用数判断已满", () => {
    expect(isUnlimitedReferralCap(2)).toBe(false);
    expect(referralRemaining(2, 0)).toBe(2);
    expect(referralRemaining(2, 2)).toBe(0);
    expect(
      resolveReferralStatus({
        enabled: true,
        maxUses: 2,
        usedCount: 2,
        startsAt: null,
        endsAt: null,
      }),
    ).toBe("full");
  });
});
