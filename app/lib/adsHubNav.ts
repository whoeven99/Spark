/**
 * 广告 hub（样例 B）左栏能力目录。
 * Pixel 审核期默认不进目录（由调用方传入 showReviewHidden）。
 */
import { appendEmbeddedSearchToPath } from "./embeddedLocationSearch";

export type AdsHubCapKey =
  | "overview"
  | "performance"
  | "attribution"
  | "connect"
  | "sync"
  | "pixels"
  | "create"
  | "edit"
  | "tasks";

export type AdsHubCapGroup = "insights" | "connect" | "campaigns";

export type AdsHubCapability = {
  key: AdsHubCapKey;
  group: AdsHubCapGroup;
  path: string;
  labelKey: string;
  hintKey: string;
  reviewHidden?: boolean;
};

export const ADS_HUB_GROUP_ORDER: readonly AdsHubCapGroup[] = [
  "insights",
  "connect",
  "campaigns",
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
    reviewHidden: true,
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
    reviewHidden: true,
  },
  {
    key: "edit",
    group: "campaigns",
    path: "/app/ads/edit",
    labelKey: "adsHub.nav.edit",
    hintKey: "adsHub.nav.editHint",
    reviewHidden: true,
  },
  {
    key: "tasks",
    group: "campaigns",
    path: "/app/ads/catalog?tab=tasks",
    labelKey: "adsHub.nav.tasks",
    hintKey: "adsHub.nav.tasksHint",
    reviewHidden: true,
  },
] as const;

export const ADS_HUB_CATALOG_PATH = "/app/ads/catalog";

export type AdsHubCatalogTab = "credentials" | "sync" | "tasks";
export type AdsHubCatalogPlatform = "google" | "facebook" | "tiktok";

export function toAdsHubCatalogPlatform(
  platform: string | null | undefined,
): AdsHubCatalogPlatform | null {
  if (platform === "meta" || platform === "facebook") return "facebook";
  if (platform === "google" || platform === "tiktok") return platform;
  return null;
}

export function buildAdsHubCatalogPath(options?: {
  tab?: AdsHubCatalogTab;
  platform?: string | null;
  extra?: Record<string, string | undefined>;
}): string {
  const params = new URLSearchParams();
  params.set("tab", options?.tab ?? "credentials");
  const platform = toAdsHubCatalogPlatform(options?.platform);
  if (platform) params.set("platform", platform);
  for (const [key, value] of Object.entries(options?.extra ?? {})) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${ADS_HUB_CATALOG_PATH}?${query}` : ADS_HUB_CATALOG_PATH;
}

/** 连接账户深链；可附带嵌入式 search（shop/host）。 */
export function buildAdsHubConnectPath(
  platform?: string | null,
  locationSearch = "",
): string {
  const path = buildAdsHubCatalogPath({ tab: "credentials", platform });
  return locationSearch ? appendEmbeddedSearchToPath(path, locationSearch) : path;
}

/** OAuth 回跳默认落到连接账户，并带上对应渠道。 */
export function withAdsHubConnectQuery(
  platform: AdsHubCatalogPlatform,
  query?: Record<string, string>,
): Record<string, string> {
  return { ...query, tab: "credentials", platform };
}

export function listVisibleAdsHubCapabilities(options: {
  showReviewHidden?: boolean;
}): AdsHubCapability[] {
  const showReviewHidden = options.showReviewHidden === true;
  return ADS_HUB_CAPABILITIES.filter((cap) =>
    isAdsHubCapabilityVisible(cap.key, { showReviewHidden }),
  );
}

export function isAdsHubCapabilityVisible(
  key: AdsHubCapKey,
  options?: { showReviewHidden?: boolean },
): boolean {
  const cap = ADS_HUB_CAPABILITIES.find((item) => item.key === key);
  if (!cap) return false;
  if (cap.reviewHidden && options?.showReviewHidden !== true) return false;
  return true;
}

export function resolveActiveAdsHubCap(
  pathname: string,
  search: string,
): AdsHubCapKey {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = params.get("tab");

  if (path.endsWith("/ads/performance")) {
    return "performance";
  }
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
