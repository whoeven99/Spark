export type ReferralStatus = "active" | "disabled" | "full" | "scheduled" | "ended";

export function isUnlimitedReferralCap(maxUses: number): boolean {
  // 0 / -1 都不当成「上限 0 已满」，只当历史不限。
  return !Number.isFinite(maxUses) || maxUses <= 0;
}

export function referralRemaining(maxUses: number, usedCount: number): number | null {
  if (isUnlimitedReferralCap(maxUses)) return null;
  return Math.max(maxUses - usedCount, 0);
}

export function resolveReferralStatus(params: {
  enabled: boolean;
  maxUses: number;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  nowMs?: number;
}): ReferralStatus {
  if (!params.enabled) return "disabled";
  const nowMs = params.nowMs ?? Date.now();
  if (params.endsAt) {
    const ends = new Date(params.endsAt).getTime();
    if (!Number.isNaN(ends) && nowMs > ends) return "ended";
  }
  if (params.startsAt) {
    const starts = new Date(params.startsAt).getTime();
    if (!Number.isNaN(starts) && nowMs < starts) return "scheduled";
  }
  if (!isUnlimitedReferralCap(params.maxUses) && params.usedCount >= params.maxUses) {
    return "full";
  }
  return "active";
}
