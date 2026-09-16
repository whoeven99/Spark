/**
 * 广告 hub（样例 B）左栏能力目录。
 * Pixel 审核期默认不进目录；沙盒仅非 production 露出（由调用方传入 isProduction）。
 */

export type AdsHubCapKey =
  | "overview"
  | "performance"
  | "attribution"
  | "connect"
  | "sync"
  | "pixels"
  | "create"
  | "edit"
  | "tasks"
  | "sandbox";

export type AdsHubCapGroup = "insights" | "connect" | "campaigns" | "dev";

export type AdsHubCapability = {
  key: AdsHubCapKey;
  group: AdsHubCapGroup;
  path: string;
  labelKey: string;
  hintKey: string;
  reviewHidden?: boolean;
  testOnly?: boolean;
};

export const ADS_HUB_GROUP_ORDER: readonly AdsHubCapGroup[] = [
  "insights",
  "connect",
  "campaigns",
  "dev",
] as const;

export const ADS_HUB_CAPABILITIES: readonly AdsHubCapability[] = [
  {
    key: "overview",
    group: "insights",
    path: "/app/ads",
    labelKey: "adsHub.nav.overview",
    hintKey: "adsHub.nav.overviewHint",
  },
  {
    key: "performance",
    group: "insights",
    path: "/app/ads/performance",
    labelKey: "adsHub.nav.performance",
    hintKey: "adsHub.nav.performanceHint",
  },
  {
    key: "attribution",
    group: "insights",
    path: "/app/ads/google-attribution",
    labelKey: "adsHub.nav.attribution",
    hintKey: "adsHub.nav.attributionHint",
  },
  {
    key: "connect",
    group: "connect",
    path: "/app/ads/catalog?tab=credentials",
    labelKey: "adsHub.nav.connect",
    hintKey: "adsHub.nav.connectHint",
  },
  {
    key: "sync",
    group: "connect",
    path: "/app/ads/catalog?tab=sync",
    labelKey: "adsHub.nav.sync",
    hintKey: "adsHub.nav.syncHint",
  },
  {
    key: "pixels",
    group: "connect",
    path: "/app/ads/pixels",
    labelKey: "adsHub.nav.pixels",
    hintKey: "adsHub.nav.pixelsHint",
    reviewHidden: true,
  },
  {
    key: "create",
    group: "campaigns",
    path: "/app/ads/create",
    labelKey: "adsHub.nav.create",
    hintKey: "adsHub.nav.createHint",
  },
  {
    key: "edit",
    group: "campaigns",
    path: "/app/ads/edit",
    labelKey: "adsHub.nav.edit",
    hintKey: "adsHub.nav.editHint",
  },
  {
    key: "tasks",
    group: "campaigns",
    path: "/app/ads/catalog?tab=tasks",
    labelKey: "adsHub.nav.tasks",
    hintKey: "adsHub.nav.tasksHint",
  },
  {
    key: "sandbox",
    group: "dev",
    path: "/app/ads/performance",
    labelKey: "adsHub.nav.sandbox",
    hintKey: "adsHub.nav.sandboxHint",
    testOnly: true,
  },
] as const;

export function listVisibleAdsHubCapabilities(options: {
  showReviewHidden?: boolean;
  isProduction: boolean;
}): AdsHubCapability[] {
  const showReviewHidden = options.showReviewHidden === true;
  return ADS_HUB_CAPABILITIES.filter((cap) => {
    if (cap.reviewHidden && !showReviewHidden) return false;
    if (cap.testOnly && options.isProduction) return false;
    return true;
  });
}

export function resolveActiveAdsHubCap(
  pathname: string,
  search: string,
): AdsHubCapKey {
  const path = pathname.replace(/\/+$/, "") || "/";
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
    "tab",
  );

  if (path.endsWith("/ads/performance")) return "performance";
  if (path.includes("/ads/google-attribution")) return "attribution";
  if (path.endsWith("/ads/create")) return "create";
  if (path.endsWith("/ads/edit")) return "edit";
  if (
    path.includes("/ads/pixels") ||
    path.includes("/ads/google-pixel") ||
    path.includes("/ads/meta-pixel")
  ) {
    return "pixels";
  }
  if (path.endsWith("/ads/catalog") || path.endsWith("/ads-catalog")) {
    if (tab === "sync") return "sync";
    if (tab === "tasks") return "tasks";
    return "connect";
  }
  if (path.endsWith("/ads")) return "overview";
  return "overview";
}

export function isAdsHubBarePath(pathname: string): boolean {
  return (
    pathname.includes("/ads/google-ads/start") ||
    pathname.includes("/ads/google-merchant/start")
  );
}
