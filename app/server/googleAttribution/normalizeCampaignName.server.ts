/** 用于 Ads / GA4 campaign 名称关联的归一化键。 */
export function normalizeCampaignName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "-");
}

const GA4_EMPTY_CAMPAIGN_KEYS = new Set([
  "",
  "(not set)",
  "(not provided)",
  "not set",
  "not provided",
]);

/** GA4 维度值是否表示有效 campaign（非空 / 非 not set）。 */
export function isGa4CampaignNamePresent(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return !GA4_EMPTY_CAMPAIGN_KEYS.has(trimmed.toLowerCase());
}
