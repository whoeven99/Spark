/**
 * 商品审核状态计数。
 *
 * GMC 与 Meta 的审核表都可能远大于明细分页上限，计数必须走 `groupBy` 全量统计，
 * 不能拿分页取样的行数当总数。
 */

export type ProductStatusSummary = {
  total: number;
  approved: number;
  pending: number;
  disapproved: number;
  /** 平台返回的其它状态（如 expiring），计入 total 但不落三个主分项 */
  other: number;
};

export type ProductStatusGroup = {
  status: string;
  _count: { _all: number };
};

export function emptyProductStatusSummary(): ProductStatusSummary {
  return { total: 0, approved: 0, pending: 0, disapproved: 0, other: 0 };
}

function normalizeStatus(raw: string): "approved" | "pending" | "disapproved" | "other" {
  const value = raw.trim().toLowerCase();
  if (value === "approved") return "approved";
  if (value === "pending") return "pending";
  if (value === "disapproved") return "disapproved";
  return "other";
}

export function summarizeProductStatusGroups(
  groups: readonly ProductStatusGroup[],
): ProductStatusSummary {
  const summary = emptyProductStatusSummary();
  for (const group of groups) {
    const count = group._count._all;
    summary.total += count;
    summary[normalizeStatus(group.status)] += count;
  }
  return summary;
}
